const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { TwitterApi } = require("twitter-api-v2");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static("."));

// ─── Gemini Setup ─────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ─── Indian Festival Calendar ─────────────────────────────────────────────────
const INDIAN_FESTIVALS = {
  "01-01": "New Year's Day",
  "01-14": "Makar Sankranti / Pongal",
  "01-26": "Republic Day",
  "02-14": "Valentine's Day",
  "03-08": "International Women's Day",
  "03-25": "Holi",
  "04-14": "Baisakhi / Ambedkar Jayanti",
  "05-01": "Labour Day",
  "05-12": "Mother's Day",
  "06-15": "Father's Day",
  "06-21": "International Yoga Day",
  "06-27": "World MSME Day",
  "07-04": "Eid al-Adha",
  "08-15": "Independence Day / Raksha Bandhan",
  "08-26": "Janmashtami",
  "09-05": "Teachers Day",
  "09-07": "Onam",
  "10-02": "Gandhi Jayanti",
  "10-12": "Navratri begins",
  "10-16": "World Food Day",
  "10-20": "Dussehra",
  "10-31": "Halloween",
  "11-01": "Diwali",
  "11-14": "Children's Day",
  "11-15": "Guru Nanak Jayanti",
  "11-28": "Black Friday",
  "12-25": "Christmas",
  "12-31": "New Year's Eve",
};

function getNearbyFestivals(windowDays = 30) {
  const today = new Date();
  const results = [];
  for (let d = -1; d <= windowDays; d++) {
    const check = new Date(today);
    check.setDate(today.getDate() + d);
    const key =
      String(check.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(check.getDate()).padStart(2, "0");
    if (INDIAN_FESTIVALS[key]) {
      results.push({
        name: INDIAN_FESTIVALS[key],
        date: check.toISOString().split("T")[0],
        daysAway: d,
      });
    }
  }
  return results;
}

// ─── Gemini Call Helper ───────────────────────────────────────────────────────
async function callGemini(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return text;
    } catch (err) {
      console.error(`Gemini attempt ${attempt + 1} failed:`, err.message);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function callGeminiJSON(prompt, retries = 2) {
  const text = await callGemini(prompt, retries);
  // Extract JSON from the response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/) ||
    [null, text];
  const clean = (jsonMatch[1] || text).trim();
  // Try to find JSON object or array
  const start = clean.indexOf("{") !== -1 ? clean.indexOf("{") : clean.indexOf("[");
  const end = clean.lastIndexOf("}") !== -1 ? clean.lastIndexOf("}") : clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  return JSON.parse(clean.substring(start, end + 1));
}

// ─── Conversation State (in-memory per session) ──────────────────────────────
const sessions = new Map();

const REQUIRED_FIELDS = [
  "business_name",
  "industry",
  "description",
  "target_audience",
  "location",
  "goals",
];

const FIELD_QUESTIONS = {
  business_name: "What's the name of your business?",
  industry:
    "What industry or category does your business fall under? (e.g., Food & Beverage, Fashion, Technology, Health & Wellness, Education, Retail, Finance)",
  description:
    "Tell me about your business — what products or services do you offer? What makes you unique?",
  target_audience:
    "Who is your ideal customer? (Think about their age range, gender, interests, and what kind of person would buy from you)",
  location:
    "Where is your business based, and where do your customers come from? (e.g., Mumbai, Pan-India, Tier 1 cities)",
  goals:
    "What's your primary marketing goal right now? (e.g., Get more followers, generate leads, boost sales, build brand awareness, launch a new product)",
};

// ─── 1. CHAT ENDPOINT (Conversational) ───────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { session_id, message } = req.body;
  if (!session_id) return res.status(400).json({ error: "session_id required" });

  // Initialize session if new
  if (!sessions.has(session_id)) {
    sessions.set(session_id, {
      collected: {},
      history: [],
      stage: "questioning", // questioning | generating | complete
      generatedData: null,
    });
  }

  const session = sessions.get(session_id);

  // If no message, send welcome + first question
  if (!message) {
    const missing = REQUIRED_FIELDS.filter((f) => !session.collected[f]);
    const firstField = missing[0];
    return res.json({
      type: "question",
      message: `Hey! 👋 I'm GrowOS — your AI-powered growth strategist.\n\nI'll build you a complete marketing plan in under 2 minutes. Let's start!\n\n${FIELD_QUESTIONS[firstField]}`,
      field: firstField,
      progress: Math.round(
        ((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100
      ),
    });
  }

  // User sent a message — use Gemini to extract info
  session.history.push({ role: "user", content: message });

  const missing = REQUIRED_FIELDS.filter((f) => !session.collected[f]);

  if (missing.length > 0 && session.stage === "questioning") {
    // Use Gemini to intelligently extract the field value from the user's natural response
    const currentField = missing[0];

    try {
      const extractPrompt = `You are a smart form parser. The user was asked about their "${currentField}" for a business marketing platform.

Their response: "${message}"

Extract the relevant value for the field "${currentField}". The field means:
- business_name: The name of their business or brand
- industry: What industry/sector (e.g., Food & Beverage, Fashion, Tech, Health, Education, Retail, Finance)
- description: A description of what the business does, its products, services, USP
- target_audience: Who their customers are (age, gender, demographics, interests)
- location: Where the business operates or targets customers
- goals: Their marketing objectives

Also determine: does the response seem too vague or incomplete for this field? If the user says something like "idk" or "not sure" or gives a very short unclear answer, mark it as vague.

Return ONLY valid JSON:
{"extracted_value": "the clean extracted value", "is_vague": true/false, "follow_up_question": "a follow-up question if vague, else empty string"}`;

      const extraction = await callGeminiJSON(extractPrompt);

      if (extraction.is_vague && extraction.follow_up_question) {
        return res.json({
          type: "follow_up",
          message: extraction.follow_up_question,
          field: currentField,
          progress: Math.round(
            ((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100
          ),
        });
      }

      // Store the extracted value
      session.collected[currentField] = extraction.extracted_value || message;
    } catch (err) {
      // If Gemini fails to parse, just store the raw message
      console.error("Extraction failed, using raw input:", err.message);
      session.collected[currentField] = message;
    }

    // Check if there are more fields to collect
    const stillMissing = REQUIRED_FIELDS.filter((f) => !session.collected[f]);

    if (stillMissing.length > 0) {
      const nextField = stillMissing[0];
      // Add a contextual transition
      const transitions = [
        `Got it! `,
        `Perfect. `,
        `Great, noted! `,
        `Awesome! `,
        `Nice. `,
      ];
      const transition = transitions[Math.floor(Math.random() * transitions.length)];

      return res.json({
        type: "question",
        message: `${transition}${FIELD_QUESTIONS[nextField]}`,
        field: nextField,
        progress: Math.round(
          ((REQUIRED_FIELDS.length - stillMissing.length) / REQUIRED_FIELDS.length) * 100
        ),
      });
    }

    // All fields collected! Generate everything
    session.stage = "generating";

    try {
      const data = await generateFullPlan(session.collected);
      session.generatedData = data;
      session.stage = "complete";

      return res.json({
        type: "full_plan",
        message:
          "✨ Your complete growth plan is ready! Review each section below — you can regenerate any part or accept it.",
        data: data,
        business_context: session.collected,
        progress: 100,
      });
    } catch (err) {
      console.error("Full plan generation failed:", err.message);
      session.stage = "questioning"; // Allow retry

      // Return fallback data
      const fallbackData = generateFallbackPlan(session.collected);
      session.generatedData = fallbackData;
      session.stage = "complete";

      return res.json({
        type: "full_plan",
        message:
          "✨ Your growth plan is ready! (Note: Using enhanced templates due to high demand — the insights are still customized to your inputs.)",
        data: fallbackData,
        business_context: session.collected,
        progress: 100,
        fallback: true,
      });
    }
  }

  // If already complete, handle follow-up questions
  if (session.stage === "complete") {
    try {
      const followUpPrompt = `You are GrowOS, an AI marketing strategist. The user has a business called "${session.collected.business_name}" in the "${session.collected.industry}" industry.

Business description: ${session.collected.description}
Target audience: ${session.collected.target_audience}
Location: ${session.collected.location}
Goals: ${session.collected.goals}

The user's follow-up question: "${message}"

Respond helpfully as a marketing expert. Keep response concise and actionable. If they ask to change something about their plan, provide specific updated recommendations.`;

      const response = await callGemini(followUpPrompt);
      return res.json({
        type: "follow_up_answer",
        message: response,
        progress: 100,
      });
    } catch (err) {
      return res.json({
        type: "follow_up_answer",
        message:
          "I'm having trouble processing that right now. Could you try rephrasing your question?",
        progress: 100,
      });
    }
  }

  return res.json({
    type: "error",
    message: "Something went wrong. Please refresh and try again.",
  });
});

// ─── FULL PLAN GENERATION ─────────────────────────────────────────────────────
async function generateFullPlan(biz) {
  const festivals = getNearbyFestivals(30);
  const festContext = festivals.length
    ? festivals.map((f) => `${f.name} on ${f.date} (${f.daysAway} days away)`).join(", ")
    : "No major festival in the next 30 days";

  const megaPrompt = `You are GrowOS, an elite AI marketing strategist for Indian businesses. Generate a comprehensive growth plan.

BUSINESS CONTEXT:
- Name: ${biz.business_name}
- Industry: ${biz.industry}
- Description: ${biz.description}
- Target Audience: ${biz.target_audience}
- Location: ${biz.location}
- Goals: ${biz.goals}
- Today's date: ${new Date().toDateString()}
- Upcoming festivals/events: ${festContext}

Generate ALL of the following in a SINGLE JSON response. Return ONLY valid JSON, NO markdown, NO explanation.

{
  "business_analysis": {
    "brand_tone": ["adjective1", "adjective2", "adjective3"],
    "target_persona": {
      "name": "persona name with archetype",
      "age_range": "XX–XX",
      "interests": ["interest1", "interest2", "interest3", "interest4"],
      "pain_points": ["pain1", "pain2"]
    },
    "marketing_goals": ["specific goal 1", "specific goal 2", "specific goal 3"],
    "content_style": {
      "visual_style": "description of visual aesthetic",
      "language_style": "description of language approach",
      "preferred_formats": ["format1", "format2", "format3"]
    },
    "competitive_edge": "One sentence about what makes this brand different"
  },
  "weekly_plan": [
    {
      "day": "Monday",
      "content_type": "Reel/Carousel/Story/Static Post/Poll",
      "topic": "specific topic",
      "caption_hint": "one-line caption preview",
      "best_time": "HH:MM AM/PM IST",
      "festival_note": "festival context if relevant, else empty"
    }
  ],
  "captions": {
    "captions": [
      {"angle": "emotional", "text": "50-120 word caption"},
      {"angle": "educational", "text": "50-120 word caption"},
      {"angle": "punchy", "text": "50-120 word caption"}
    ],
    "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8", "#tag9", "#tag10"],
    "cta": "clear call-to-action text"
  },
  "ad_recommendations": {
    "ad_recommendations": [
      {
        "platform": "Meta (Instagram + Facebook)",
        "objective": "campaign objective",
        "audience_targeting": {
          "age": "XX–XX",
          "location": "target locations",
          "interests": ["interest1", "interest2", "interest3"]
        },
        "budget_suggestion": {
          "daily_inr": 0,
          "rationale": "budget reasoning"
        },
        "ad_copy": {
          "headline": "max 30 chars",
          "primary_text": "max 90 chars",
          "description": "supporting text"
        },
        "best_format": "recommended ad format"
      },
      {
        "platform": "Google Search",
        "objective": "campaign objective",
        "audience_targeting": {
          "age": "XX–XX",
          "location": "target locations",
          "interests": ["search term1", "search term2"]
        },
        "budget_suggestion": {
          "daily_inr": 0,
          "rationale": "budget reasoning"
        },
        "ad_copy": {
          "headline": "max 30 chars",
          "primary_text": "max 90 chars",
          "description": "supporting text"
        },
        "best_format": "recommended ad format"
      }
    ]
  },
  "festival_trends": {
    "upcoming_events": [
      {"name": "event name", "date": "YYYY-MM-DD", "relevance_score": 8}
    ],
    "campaign_ideas": [
      {
        "event": "event name",
        "hook": "catchy campaign hook",
        "content_angle": "content approach",
        "suggested_offer": "promotional offer idea"
      }
    ],
    "trending_hashtags": ["#trend1", "#trend2", "#trend3", "#trend4", "#trend5"]
  }
}

RULES:
- weekly_plan MUST have exactly 7 entries (Mon–Sun)
- All content must be specific to THIS business, not generic
- Captions should sound human, not AI-generated
- Budget suggestions in INR, realistic for Indian SMBs
- Include at least 3 upcoming_events and 2 campaign_ideas
- Make hashtags a mix of niche (brand-specific) and broad (trending)`;

  return await callGeminiJSON(megaPrompt);
}

// ─── FALLBACK PLAN (when API fails) ───────────────────────────────────────────
function generateFallbackPlan(biz) {
  return {
    business_analysis: {
      brand_tone: ["professional", "approachable", "innovative"],
      target_persona: {
        name: `Ideal ${biz.industry || "business"} customer`,
        age_range: "22–38",
        interests: ["quality products", "social media", "trending content", "deals"],
        pain_points: ["lack of trusted options", "poor customer experience"],
      },
      marketing_goals: [
        `Build ${biz.business_name || "brand"} awareness on Instagram & Facebook`,
        "Generate 50+ qualified leads per month through social content",
        "Convert 5% of followers into paying customers within 90 days",
      ],
      content_style: {
        visual_style: "clean, modern with warm tones",
        language_style: "conversational Hinglish — relatable and authentic",
        preferred_formats: ["Reels", "Carousels", "Story Polls"],
      },
      competitive_edge: `${biz.business_name || "This brand"} stands out through authentic quality in the ${biz.industry || "local"} market.`,
    },
    weekly_plan: [
      { day: "Monday", content_type: "Reel", topic: `Behind the scenes at ${biz.business_name || "our workspace"}`, caption_hint: "Mondays hit different when you love what you do.", best_time: "7:30 PM IST", festival_note: "" },
      { day: "Tuesday", content_type: "Carousel", topic: `5 reasons customers choose ${biz.business_name || "us"}`, caption_hint: "Swipe to see what keeps them coming back.", best_time: "12:00 PM IST", festival_note: "" },
      { day: "Wednesday", content_type: "Story", topic: "Poll: What do you want to see more of?", caption_hint: "Your opinion matters to us — vote now!", best_time: "6:00 PM IST", festival_note: "" },
      { day: "Thursday", content_type: "Static Post", topic: "Customer spotlight — real success stories", caption_hint: "Real people. Real results. Real love.", best_time: "9:00 AM IST", festival_note: "" },
      { day: "Friday", content_type: "Reel", topic: "Friday motivation for entrepreneurs", caption_hint: "End the week strong. Build something great.", best_time: "6:30 PM IST", festival_note: "" },
      { day: "Saturday", content_type: "Carousel", topic: `Top tips for ${biz.industry || "your industry"}`, caption_hint: "Save this for later — you'll thank us.", best_time: "11:00 AM IST", festival_note: "" },
      { day: "Sunday", content_type: "Poll", topic: "What should we launch next?", caption_hint: "You decide. We'll make it happen.", best_time: "5:00 PM IST", festival_note: "" },
    ],
    captions: {
      captions: [
        { angle: "emotional", text: `We started ${biz.business_name || "this journey"} with one simple belief — that quality shouldn't be a luxury. Every single day, we wake up obsessed with making something better than yesterday. This isn't just a business. It's a promise to you.` },
        { angle: "educational", text: `Did you know? 80% of buying decisions in ${biz.industry || "this industry"} are driven by trust, not price. That's why we focus on consistency — in our product, our communication, and our experience. Build trust first. Growth follows.` },
        { angle: "punchy", text: `You've been thinking about it. We've been building it. ${biz.business_name || "The brand"} you've been waiting for is here — and it's everything you asked for. Don't sleep on this. Link in bio.` },
      ],
      hashtags: [
        `#${(biz.business_name || "Brand").replace(/\s+/g, "")}`,
        `#${(biz.industry || "business").replace(/[\s&]+/g, "")}`,
        "#IndianBusiness", "#StartupIndia", "#GrowWithUs",
        "#ContentMarketing", "#DigitalIndia", "#SocialMediaMarketing",
        "#BusinessGrowth", "#MakeInIndia",
      ],
      cta: `Follow @${(biz.business_name || "us").toLowerCase().replace(/\s+/g, "")} for more — and drop your thoughts in the comments!`,
    },
    ad_recommendations: {
      ad_recommendations: [
        {
          platform: "Meta (Instagram + Facebook)",
          objective: "Brand Awareness",
          audience_targeting: { age: "22–38", location: biz.location || "Tier 1 Indian cities", interests: [biz.industry || "business", "online shopping", "social media"] },
          budget_suggestion: { daily_inr: 300, rationale: "Low-CPL awareness phase; scale after first week if engagement > 3%" },
          ad_copy: { headline: `Discover ${(biz.business_name || "Us").substring(0, 20)}`, primary_text: `${(biz.description || "Quality products you'll love").substring(0, 85)}`, description: "Trusted by hundreds. Try us today." },
          best_format: "Reel ad with text overlay",
        },
        {
          platform: "Google Search",
          objective: "Website Traffic",
          audience_targeting: { age: "20–45", location: biz.location || "Pan India", interests: [`best ${biz.industry || "products"} near me`, `${biz.industry || "quality"} online`] },
          budget_suggestion: { daily_inr: 500, rationale: "Intent-based search ads convert 3x better; start with exact match keywords" },
          ad_copy: { headline: `Best ${(biz.industry || "Products").substring(0, 22)}`, primary_text: `${(biz.business_name || "Top quality")} — trusted by customers across India.`, description: "Visit today. Free consultation." },
          best_format: "Responsive Search Ad with location extension",
        },
      ],
    },
    festival_trends: {
      upcoming_events: getNearbyFestivals(30).slice(0, 4).map((f, i) => ({
        name: f.name, date: f.date, relevance_score: Math.max(6, 10 - i),
      })),
      campaign_ideas: [
        { event: "Upcoming Festival", hook: "Celebrate with special offers!", content_angle: "Festival-themed content series", suggested_offer: "Festival special: 15% off for 3 days" },
        { event: "Season Launch", hook: "New season, new energy", content_angle: "Product showcase with seasonal themes", suggested_offer: "Free shipping on all orders this week" },
      ],
      trending_hashtags: ["#FestiveSeason", "#IndianFestivals", "#TrendingNow", "#ShopLocal", "#SupportSmallBusiness"],
    },
  };
}

// ─── 2. REGENERATE ENDPOINT ──────────────────────────────────────────────────
app.post("/api/regenerate", async (req, res) => {
  const { session_id, section } = req.body;
  // section is one of: business_analysis, weekly_plan, captions, ad_recommendations, festival_trends

  if (!session_id || !section) {
    return res.status(400).json({ error: "session_id and section required" });
  }

  const session = sessions.get(session_id);
  if (!session || !session.collected) {
    return res.status(400).json({ error: "No active session found" });
  }

  const biz = session.collected;
  const festivals = getNearbyFestivals(30);
  const festContext = festivals.length
    ? festivals.map((f) => `${f.name} on ${f.date}`).join(", ")
    : "No major festival in the next 30 days";

  const sectionPrompts = {
    business_analysis: `Generate a brand analysis for "${biz.business_name}" (${biz.industry}).
Description: ${biz.description}
Audience: ${biz.target_audience}
Goals: ${biz.goals}

Return ONLY JSON: {"brand_tone":["","",""],"target_persona":{"name":"","age_range":"","interests":[],"pain_points":[]},"marketing_goals":["","",""],"content_style":{"visual_style":"","language_style":"","preferred_formats":[]},"competitive_edge":""}
Make it different from a previous generation — explore new angles.`,

    weekly_plan: `Create a 7-day content calendar for "${biz.business_name}" (${biz.industry}).
Audience: ${biz.target_audience}, Platform focus: Instagram.
Festivals/events nearby: ${festContext}
Today: ${new Date().toDateString()}

Return ONLY a JSON array of 7 objects:
[{"day":"Monday","content_type":"","topic":"","caption_hint":"","best_time":"","festival_note":""}]
Vary content types. Make topics specific to this business. Be creative with different ideas than before.`,

    captions: `Write 3 social media captions for "${biz.business_name}" (${biz.industry}).
Description: ${biz.description}
Audience: ${biz.target_audience}
Tone: conversational, natural, human

Return ONLY JSON:
{"captions":[{"angle":"emotional","text":""},{"angle":"educational","text":""},{"angle":"punchy","text":""}],"hashtags":[],"cta":""}
50-120 words per caption. 10 hashtags mixing niche + broad. Make completely different from previous versions.`,

    ad_recommendations: `Create ad strategy for "${biz.business_name}" (${biz.industry}).
Audience: ${biz.target_audience}, Location: ${biz.location}, Goal: ${biz.goals}

Return ONLY JSON:
{"ad_recommendations":[{"platform":"Meta (Instagram + Facebook)","objective":"","audience_targeting":{"age":"","location":"","interests":[]},"budget_suggestion":{"daily_inr":0,"rationale":""},"ad_copy":{"headline":"","primary_text":"","description":""},"best_format":""},{"platform":"Google Search","objective":"","audience_targeting":{"age":"","location":"","interests":[]},"budget_suggestion":{"daily_inr":0,"rationale":""},"ad_copy":{"headline":"","primary_text":"","description":""},"best_format":""}]}
Budgets in INR. Fresh approach compared to previous.`,

    festival_trends: `Identify upcoming festivals and campaign ideas for "${biz.business_name}" (${biz.industry}).
Today: ${new Date().toISOString().split("T")[0]}
Known upcoming: ${festContext}

Return ONLY JSON:
{"upcoming_events":[{"name":"","date":"YYYY-MM-DD","relevance_score":0}],"campaign_ideas":[{"event":"","hook":"","content_angle":"","suggested_offer":""}],"trending_hashtags":[]}
3-4 events, 2-3 campaign ideas, 5 hashtags. relevance_score 1-10 based on industry fit.`,
  };

  const prompt = sectionPrompts[section];
  if (!prompt) {
    return res.status(400).json({ error: `Unknown section: ${section}` });
  }

  try {
    const data = await callGeminiJSON(prompt);

    // Update session data
    if (session.generatedData) {
      if (section === "weekly_plan") {
        session.generatedData.weekly_plan = data;
      } else if (section === "captions") {
        session.generatedData.captions = data;
      } else if (section === "ad_recommendations") {
        session.generatedData.ad_recommendations = data;
      } else {
        session.generatedData[section] = data;
      }
    }

    return res.json({ success: true, section, data });
  } catch (err) {
    console.error(`Regenerate ${section} failed:`, err.message);
    return res.json({
      success: false,
      fallback: true,
      section,
      data: session.generatedData?.[section] || null,
      error: "Regeneration failed. Showing previous version.",
    });
  }
});

// ─── 3. SOCIAL MEDIA POSTING ─────────────────────────────────────────────────

// Search Unsplash for an image
app.post("/api/unsplash-search", async (req, res) => {
  const { query } = req.body;
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return res.json({ success: false, error: "Unsplash API key not configured" });
  }

  try {
    const response = await axios.get("https://api.unsplash.com/search/photos", {
      params: { query, per_page: 6, orientation: "squarish" },
      headers: { Authorization: `Client-ID ${key}` },
    });
    const images = response.data.results.map((img) => ({
      id: img.id,
      url: img.urls.regular,
      thumb: img.urls.thumb,
      alt: img.alt_description,
      credit: img.user.name,
    }));
    return res.json({ success: true, images });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// Post to social media
app.post("/api/post-social", async (req, res) => {
  const { platforms, caption, image_url } = req.body;
  // platforms: array of ["instagram", "facebook", "twitter"]

  const results = {};

  for (const platform of platforms) {
    try {
      if (platform === "facebook") {
        results.facebook = await postToFacebook(caption, image_url);
      } else if (platform === "instagram") {
        results.instagram = await postToInstagram(caption, image_url);
      } else if (platform === "twitter") {
        results.twitter = await postToTwitter(caption);
      }
    } catch (err) {
      results[platform] = { success: false, error: err.message };
    }
  }

  return res.json({ results });
});

async function postToFacebook(caption, imageUrl) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;

  if (!token || !pageId) {
    return { success: false, error: "Facebook credentials not configured. Add FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID to .env" };
  }

  try {
    let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    let data = { message: caption, access_token: token };

    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      data = { message: caption, url: imageUrl, access_token: token };
    }

    const response = await axios.post(endpoint, data);
    return { success: true, post_id: response.data.id || response.data.post_id };
  } catch (err) {
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

async function postToInstagram(caption, imageUrl) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;

  if (!token || !igAccountId) {
    return { success: false, error: "Instagram credentials not configured. Add FACEBOOK_PAGE_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID to .env" };
  }

  if (!imageUrl) {
    return { success: false, error: "Instagram requires an image URL for posting" };
  }

  try {
    // Step 1: Create media container
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igAccountId}/media`,
      { image_url: imageUrl, caption, access_token: token }
    );

    const creationId = containerRes.data.id;

    // Step 2: Publish
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
      { creation_id: creationId, access_token: token }
    );

    return { success: true, post_id: publishRes.data.id };
  } catch (err) {
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

async function postToTwitter(caption) {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return { success: false, error: "Twitter credentials not configured. Add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET to .env" };
  }

  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    });

    // Truncate to 280 chars for Twitter
    const text = caption.length > 280 ? caption.substring(0, 277) + "..." : caption;
    const tweet = await client.v2.tweet(text);
    return { success: true, tweet_id: tweet.data.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Check which social accounts are connected ───────────────────────────────
app.get("/api/social-status", (_req, res) => {
  res.json({
    facebook: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_ID),
    instagram: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.INSTAGRAM_ACCOUNT_ID),
    twitter: !!(
      process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
    ),
  });
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: "Gemini 1.5 Flash",
    gemini_key_configured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ─── Reset session ────────────────────────────────────────────────────────────
app.post("/api/reset", (req, res) => {
  const { session_id } = req.body;
  if (session_id) sessions.delete(session_id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`GrowOS backend → http://localhost:${PORT}`));

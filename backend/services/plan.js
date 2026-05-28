'use strict';

const { callGeminiJSON } = require('./gemini');
const { getNearbyFestivals } = require('../helpers/festivals');
const logger = require('../utils/logger');

/**
 * Required fields to collect from the user during onboarding chat.
 * @type {string[]}
 */
const REQUIRED_FIELDS = [
  'business_name',
  'industry',
  'description',
  'target_audience',
  'location',
  'goals',
];

/**
 * Question to ask for each required field.
 * @type {Object.<string, string>}
 */
const FIELD_QUESTIONS = {
  business_name: "What's the name of your business?",
  industry:
    'What industry or category does your business fall under? (e.g., Food & Beverage, Fashion, Technology, Health & Wellness, Education, Retail, Finance)',
  description:
    'Tell me about your business — what products or services do you offer? What makes you unique?',
  target_audience:
    'Who is your ideal customer? (Think about their age range, gender, interests, and what kind of person would buy from you)',
  location:
    'Where is your business based, and where do your customers come from? (e.g., Mumbai, Pan-India, Tier 1 cities)',
  goals:
    "What's your primary marketing goal right now? (e.g., Get more followers, generate leads, boost sales, build brand awareness, launch a new product)",
};

/** @type {string[]} Transition phrases for chat UX */
const TRANSITIONS = ['Got it! ', 'Perfect. ', 'Great, noted! ', 'Awesome! ', 'Nice. '];

/**
 * Pick a random transition phrase.
 * @returns {string}
 */
function randomTransition() {
  return TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
}

/**
 * Use Gemini to intelligently extract a field value from a user's natural-language response.
 * @param {string} field
 * @param {string} message
 * @returns {Promise<{ extracted_value: string, is_vague: boolean, follow_up_question: string }>}
 */
async function extractField(field, message) {
  const prompt = `You are a smart form parser. The user was asked about their "${field}" for a business marketing platform.

Their response: "${message}"

Extract the relevant value for the field "${field}". The field means:
- business_name: The name of their business or brand
- industry: What industry/sector (e.g., Food & Beverage, Fashion, Tech, Health, Education, Retail, Finance)
- description: A description of what the business does, its products, services, USP
- target_audience: Who their customers are (age, gender, demographics, interests)
- location: Where the business operates or targets customers
- goals: Their marketing objectives

Also determine: does the response seem too vague or incomplete? If the user says "idk", "not sure", or gives a very short unclear answer, mark it as vague.

Return ONLY valid JSON:
{"extracted_value":"the clean extracted value","is_vague":true/false,"follow_up_question":"a follow-up question if vague, else empty string"}`;

  return callGeminiJSON(prompt);
}

/**
 * Generate a complete AI marketing plan for the given business context.
 * @param {Object} biz - Collected business fields
 * @returns {Promise<Object>} - Full plan object
 */
async function generateFullPlan(biz) {
  const festivals = getNearbyFestivals(30);
  const festContext = festivals.length
    ? festivals.map((f) => `${f.name} on ${f.date} (${f.daysAway} days away)`).join(', ')
    : 'No major festival in the next 30 days';

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
    "brand_tone": ["adjective1","adjective2","adjective3"],
    "target_persona": {
      "name": "persona name with archetype",
      "age_range": "XX–XX",
      "interests": ["interest1","interest2","interest3","interest4"],
      "pain_points": ["pain1","pain2"]
    },
    "marketing_goals": ["specific goal 1","specific goal 2","specific goal 3"],
    "content_style": {
      "visual_style": "description of visual aesthetic",
      "language_style": "description of language approach",
      "preferred_formats": ["format1","format2","format3"]
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
      {"angle":"emotional","text":"50-120 word caption"},
      {"angle":"educational","text":"50-120 word caption"},
      {"angle":"punchy","text":"50-120 word caption"}
    ],
    "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8","#tag9","#tag10"],
    "cta": "clear call-to-action text"
  },
  "ad_recommendations": {
    "ad_recommendations": [
      {
        "platform": "Meta (Instagram + Facebook)",
        "objective": "campaign objective",
        "audience_targeting": {"age":"XX–XX","location":"target locations","interests":["interest1","interest2","interest3"]},
        "budget_suggestion": {"daily_inr":0,"rationale":"budget reasoning"},
        "ad_copy": {"headline":"max 30 chars","primary_text":"max 90 chars","description":"supporting text"},
        "best_format": "recommended ad format"
      },
      {
        "platform": "Google Search",
        "objective": "campaign objective",
        "audience_targeting": {"age":"XX–XX","location":"target locations","interests":["search term1","search term2"]},
        "budget_suggestion": {"daily_inr":0,"rationale":"budget reasoning"},
        "ad_copy": {"headline":"max 30 chars","primary_text":"max 90 chars","description":"supporting text"},
        "best_format": "recommended ad format"
      }
    ]
  },
  "festival_trends": {
    "upcoming_events": [
      {"name":"event name","date":"YYYY-MM-DD","relevance_score":8}
    ],
    "campaign_ideas": [
      {
        "event":"event name",
        "hook":"catchy campaign hook",
        "content_angle":"content approach",
        "suggested_offer":"promotional offer idea"
      }
    ],
    "trending_hashtags": ["#trend1","#trend2","#trend3","#trend4","#trend5"]
  }
}

RULES:
- weekly_plan MUST have exactly 7 entries (Mon–Sun)
- All content must be specific to THIS business, not generic
- Captions should sound human, not AI-generated
- Budget suggestions in INR, realistic for Indian SMBs
- Include at least 3 upcoming_events and 2 campaign_ideas
- Make hashtags a mix of niche and broad`;

  return callGeminiJSON(megaPrompt);
}

/**
 * Generate a fresh version of a single plan section.
 * @param {string} section
 * @param {Object} biz
 * @returns {Promise<any>}
 */
async function regenerateSection(section, biz) {
  const festivals = getNearbyFestivals(30);
  const festContext = festivals.length
    ? festivals.map((f) => `${f.name} on ${f.date}`).join(', ')
    : 'No major festival in the next 30 days';

  const sectionPrompts = {
    business_analysis: `Generate a brand analysis for "${biz.business_name}" (${biz.industry}).
Description: ${biz.description}
Audience: ${biz.target_audience}
Goals: ${biz.goals}

Return ONLY JSON: {"brand_tone":["","",""],"target_persona":{"name":"","age_range":"","interests":[],"pain_points":[]},"marketing_goals":["","",""],"content_style":{"visual_style":"","language_style":"","preferred_formats":[]},"competitive_edge":""}
Make it different from the previous — explore new angles.`,

    weekly_plan: `Create a 7-day content calendar for "${biz.business_name}" (${biz.industry}).
Audience: ${biz.target_audience}, Platform focus: Instagram.
Festivals/events nearby: ${festContext}
Today: ${new Date().toDateString()}

Return ONLY a JSON array of 7 objects:
[{"day":"Monday","content_type":"","topic":"","caption_hint":"","best_time":"","festival_note":""}]
Vary content types. Make topics specific to this business. Be creative.`,

    captions: `Write 3 social media captions for "${biz.business_name}" (${biz.industry}).
Description: ${biz.description}
Audience: ${biz.target_audience}
Tone: conversational, natural, human

Return ONLY JSON:
{"captions":[{"angle":"emotional","text":""},{"angle":"educational","text":""},{"angle":"punchy","text":""}],"hashtags":[],"cta":""}
50-120 words per caption. 10 hashtags mixing niche + broad. Different from previous versions.`,

    ad_recommendations: `Create ad strategy for "${biz.business_name}" (${biz.industry}).
Audience: ${biz.target_audience}, Location: ${biz.location}, Goal: ${biz.goals}

Return ONLY JSON:
{"ad_recommendations":[{"platform":"Meta (Instagram + Facebook)","objective":"","audience_targeting":{"age":"","location":"","interests":[]},"budget_suggestion":{"daily_inr":0,"rationale":""},"ad_copy":{"headline":"","primary_text":"","description":""},"best_format":""},{"platform":"Google Search","objective":"","audience_targeting":{"age":"","location":"","interests":[]},"budget_suggestion":{"daily_inr":0,"rationale":""},"ad_copy":{"headline":"","primary_text":"","description":""},"best_format":""}]}
Budgets in INR. Fresh approach.`,

    festival_trends: `Identify upcoming festivals and campaign ideas for "${biz.business_name}" (${biz.industry}).
Today: ${new Date().toISOString().split('T')[0]}
Known upcoming: ${festContext}

Return ONLY JSON:
{"upcoming_events":[{"name":"","date":"YYYY-MM-DD","relevance_score":0}],"campaign_ideas":[{"event":"","hook":"","content_angle":"","suggested_offer":""}],"trending_hashtags":[]}
3-4 events, 2-3 campaign ideas, 5 hashtags. relevance_score 1-10 based on industry fit.`,
  };

  const prompt = sectionPrompts[section];
  if (!prompt) throw new Error(`Unknown section: ${section}`);

  return callGeminiJSON(prompt);
}

/**
 * Generate a fallback plan using smart templates (used when Gemini is unavailable).
 * @param {Object} biz
 * @returns {Object}
 */
function generateFallbackPlan(biz) {
  return {
    business_analysis: {
      brand_tone: ['professional', 'approachable', 'innovative'],
      target_persona: {
        name: `Ideal ${biz.industry || 'business'} customer`,
        age_range: '22–38',
        interests: ['quality products', 'social media', 'trending content', 'deals'],
        pain_points: ['lack of trusted options', 'poor customer experience'],
      },
      marketing_goals: [
        `Build ${biz.business_name || 'brand'} awareness on Instagram & Facebook`,
        'Generate 50+ qualified leads per month through social content',
        'Convert 5% of followers into paying customers within 90 days',
      ],
      content_style: {
        visual_style: 'clean, modern with warm tones',
        language_style: 'conversational Hinglish — relatable and authentic',
        preferred_formats: ['Reels', 'Carousels', 'Story Polls'],
      },
      competitive_edge: `${biz.business_name || 'This brand'} stands out through authentic quality in the ${biz.industry || 'local'} market.`,
    },
    weekly_plan: [
      { day: 'Monday', content_type: 'Reel', topic: `Behind the scenes at ${biz.business_name || 'our workspace'}`, caption_hint: 'Mondays hit different when you love what you do.', best_time: '7:30 PM IST', festival_note: '' },
      { day: 'Tuesday', content_type: 'Carousel', topic: `5 reasons customers choose ${biz.business_name || 'us'}`, caption_hint: 'Swipe to see what keeps them coming back.', best_time: '12:00 PM IST', festival_note: '' },
      { day: 'Wednesday', content_type: 'Story', topic: 'Poll: What do you want to see more of?', caption_hint: 'Your opinion matters — vote now!', best_time: '6:00 PM IST', festival_note: '' },
      { day: 'Thursday', content_type: 'Static Post', topic: 'Customer spotlight — real success stories', caption_hint: 'Real people. Real results.', best_time: '9:00 AM IST', festival_note: '' },
      { day: 'Friday', content_type: 'Reel', topic: 'Friday motivation for entrepreneurs', caption_hint: 'End the week strong. Build something great.', best_time: '6:30 PM IST', festival_note: '' },
      { day: 'Saturday', content_type: 'Carousel', topic: `Top tips for ${biz.industry || 'your industry'}`, caption_hint: "Save this for later — you'll thank us.", best_time: '11:00 AM IST', festival_note: '' },
      { day: 'Sunday', content_type: 'Poll', topic: 'What should we launch next?', caption_hint: "You decide. We'll make it happen.", best_time: '5:00 PM IST', festival_note: '' },
    ],
    captions: {
      captions: [
        { angle: 'emotional', text: `We started ${biz.business_name || 'this journey'} with one simple belief — that quality shouldn't be a luxury. Every single day, we wake up obsessed with making something better than yesterday. This isn't just a business. It's a promise to you.` },
        { angle: 'educational', text: `Did you know? 80% of buying decisions in ${biz.industry || 'this industry'} are driven by trust, not price. That's why we focus on consistency — in our product, our communication, and our experience. Build trust first. Growth follows.` },
        { angle: 'punchy', text: `You've been thinking about it. We've been building it. ${biz.business_name || 'The brand'} you've been waiting for is here. Don't sleep on this. Link in bio.` },
      ],
      hashtags: [
        `#${(biz.business_name || 'Brand').replace(/\s+/g, '')}`,
        `#${(biz.industry || 'business').replace(/[\s&]+/g, '')}`,
        '#IndianBusiness', '#StartupIndia', '#GrowWithUs',
        '#ContentMarketing', '#DigitalIndia', '#SocialMediaMarketing',
        '#BusinessGrowth', '#MakeInIndia',
      ],
      cta: `Follow @${(biz.business_name || 'us').toLowerCase().replace(/\s+/g, '')} for more!`,
    },
    ad_recommendations: {
      ad_recommendations: [
        {
          platform: 'Meta (Instagram + Facebook)',
          objective: 'Brand Awareness',
          audience_targeting: { age: '22–38', location: biz.location || 'Tier 1 Indian cities', interests: [biz.industry || 'business', 'online shopping', 'social media'] },
          budget_suggestion: { daily_inr: 300, rationale: 'Low-CPL awareness phase; scale after first week if engagement > 3%' },
          ad_copy: { headline: `Discover ${(biz.business_name || 'Us').substring(0, 20)}`, primary_text: `${(biz.description || 'Quality products you will love').substring(0, 85)}`, description: 'Trusted by hundreds. Try us today.' },
          best_format: 'Reel ad with text overlay',
        },
        {
          platform: 'Google Search',
          objective: 'Website Traffic',
          audience_targeting: { age: '20–45', location: biz.location || 'Pan India', interests: [`best ${biz.industry || 'products'} near me`, `${biz.industry || 'quality'} online`] },
          budget_suggestion: { daily_inr: 500, rationale: 'Intent-based search ads convert 3x better; start with exact match keywords' },
          ad_copy: { headline: `Best ${(biz.industry || 'Products').substring(0, 22)}`, primary_text: `${(biz.business_name || 'Top quality')} — trusted by customers across India.`, description: 'Visit today. Free consultation.' },
          best_format: 'Responsive Search Ad with location extension',
        },
      ],
    },
    festival_trends: {
      upcoming_events: getNearbyFestivals(30).slice(0, 4).map((f, i) => ({
        name: f.name, date: f.date, relevance_score: Math.max(6, 10 - i),
      })),
      campaign_ideas: [
        { event: 'Upcoming Festival', hook: 'Celebrate with special offers!', content_angle: 'Festival-themed content series', suggested_offer: 'Festival special: 15% off for 3 days' },
        { event: 'Season Launch', hook: 'New season, new energy', content_angle: 'Product showcase with seasonal themes', suggested_offer: 'Free shipping on all orders this week' },
      ],
      trending_hashtags: ['#FestiveSeason', '#IndianFestivals', '#TrendingNow', '#ShopLocal', '#SupportSmallBusiness'],
    },
  };
}

module.exports = {
  REQUIRED_FIELDS,
  FIELD_QUESTIONS,
  randomTransition,
  extractField,
  generateFullPlan,
  regenerateSection,
  generateFallbackPlan,
};

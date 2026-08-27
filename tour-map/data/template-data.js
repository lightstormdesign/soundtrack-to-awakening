// Outreach copy, mirrored from lightstorm.co/template so the map's
// "Email this festival" flow uses the exact same rules/template/AI prompt
// the main site already teaches — not a rewritten version.
window.LS_TEMPLATE = {
  RULES: [
    { n: 1, rule: "One specific detail, not generic praise.", principle: "Specificity = Credibility" },
    { n: 2, rule: "Lead with demand if you have it.", principle: "Social Proof" },
    { n: 3, rule: "State the ask by sentence two.", principle: "Reduce Time Delay" },
    { n: 4, rule: "Match your proof to THEIR lineup.", principle: "Borrowed Authority" },
    { n: 5, rule: "One hard number, not a stats page.", principle: "Anchoring" },
    { n: 6, rule: "One video, hook in the first seconds.", principle: "Demonstrate, don't claim." },
    { n: 7, rule: "Low-pressure close, under 150 words.", principle: "Reducing Reactance" },
  ],

  REFERENCE_TEMPLATE: `Hey [First Name] — [Your Name] here

[ONE specific detail about them — Rule 1]

I'm on tour and have an opening that lines up with your dates — I'd love to support. I make [genre as a feeling]. I've performed for crowds up to [best crowd number] and at [1-2 named festivals], and recently [toured/played] with [artist(s) — ONLY if booked at this festival, Rule 4]. Currently [momentum signal].

I've also been [1-2 secondary offerings]. Open to whatever resonates for the space.

Watch a clip of the show here: [ONE highlight reel/promo video link]

Instagram: @[handle] | Full press kit: [link]

Either way, I respect what you're building. If it feels aligned: [phone] or reply here.

Blessings,
— [Your Name]`,

  AI_PROMPT_TEMPLATE: `Write me a short booking outreach email using this exact formula:

RULES (follow all seven, do not skip any):
1. Open with ONE specific, real detail about this event/venue. If you have web browsing access, briefly look at the event's website (I'll give you the URL below) and pull one genuine detail — their stated mission, a value they emphasize (like sustainability, community, sacred reciprocity), or a phrase from their About page. Use that instead of generic praise. If you can't browse, use whatever I tell you about them below.
2. If I have real demand signal (fans asking, mentions, tags), lead with that instead of "I love your vibe."
3. State the ask (touring, opening, want to support) by sentence two.
4. Only name past tourmates/artists I've performed with if they are actually booked at THIS event — check my "artists I've played with" list against the lineup info I give you and only use overlaps. If none overlap, skip this and use my best festival name instead.
5. Use exactly ONE stat from my info below — pick the single most impressive one.
6. Include ONE link to my promo video/highlight reel — never a raw channel link or multiple video links. Frame it as "watch a clip" not "check out my channel."
7. Close low-pressure: give an easy out, then an easy either/or CTA (call or reply). Keep the whole email under 150 words. Detached, warm, no corporate tone, no "I hope you're having a beautiful day" type filler. Never suggest attaching files — links only.

MY INFO:
- Name / genre in one phrase:
- Best crowd size / stat (pick one: monthly listeners, streams, biggest crowd):
- Festivals I've played (name-drop worthy):
- Artists I've toured with or directly supported (full list, so you can check for overlap):
- Current momentum signal (tour flyer, new single, upcoming video, etc.):
- Secondary offerings (workshops, sets, circles, anything beyond the main show):
- Promo video / highlight reel link (ONE, best moment first):
- Instagram handle + full press kit / EPK link:
- Phone number:

TARGET EVENT:
- Event/venue name: {{EVENT_NAME}}
- Event website URL (so you can browse it for Rule 1, if able): {{EVENT_WEBSITE}}
- What I know about their mission/vibe/audience (backup if you can't browse):
- Their lineup or past lineup, if known (paste names, even a rough list):

Write the email now, following all seven rules above.`,
};

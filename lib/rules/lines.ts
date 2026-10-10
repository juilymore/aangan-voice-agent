// Exact lines check_fit returns for the agent to say (functional_design §8).
// Rules: warm, short, honest; no numbers, no prices or cost words, no mention of rules or assessment.
// Hindi and Marathi use feminine self-reference to match the agent's female voice.
import type { ClarifyCode, DeclineCode } from "./types";

export type Lang = "en" | "hi" | "mr";

export const DECLINE_LINES: Record<DeclineCode, Record<Lang, string>> = {
  area: {
    en: "Thank you for thinking of us. At the moment we only take on projects within Pune and PCMC, because our own teams need to be on site. I'm sorry we can't help with this one.",
    hi: "हमें याद करने के लिए धन्यवाद। अभी हम सिर्फ़ पुणे और पीसीएमसी के प्रोजेक्ट ही लेते हैं, क्योंकि हमारी अपनी टीम को साइट पर रहना होता है। माफ़ कीजिए, इस बार हम मदद नहीं कर पाएँगे।",
    mr: "आमची आठवण ठेवल्याबद्दल धन्यवाद. सध्या आम्ही फक्त पुणे आणि पीसीएमसीमधले प्रोजेक्ट घेतो, कारण आमची स्वतःची टीम साइटवर असावी लागते. माफ करा, या वेळी आम्ही मदत करू शकणार नाही.",
  },
  scope: {
    en: "We're a full-service studio, so our work always includes both the design and carrying it out. If you decide to go ahead with a full redesign later, we'd love to hear from you.",
    hi: "हम एक फ़ुल-सर्विस स्टूडियो हैं, इसलिए हमारे काम में डिज़ाइन और उसे पूरा करवाना, दोनों शामिल होते हैं। अगर आगे चलकर आप पूरा रीडिज़ाइन करवाना चाहें, तो हमें ज़रूर बताइए।",
    mr: "आम्ही फुल-सर्व्हिस स्टुडिओ आहोत, त्यामुळे आमच्या कामात डिझाइन आणि ते प्रत्यक्ष करून देणं, दोन्ही असतं. पुढे तुम्हाला पूर्ण रीडिझाइन करायचं ठरलं, तर आम्हाला नक्की कळवा.",
  },
  excluded_type: {
    en: "That sounds like an exciting project. Spaces like that need a specialist studio, and we focus on homes and offices, so we wouldn't be the right fit. I'm sorry I can't help with this one.",
    hi: "यह बहुत अच्छा प्रोजेक्ट लगता है। ऐसी जगहों के लिए किसी स्पेशलिस्ट स्टूडियो की ज़रूरत होती है, और हम घरों और ऑफ़िस पर काम करते हैं, इसलिए हम सही विकल्प नहीं होंगे। माफ़ कीजिए, इस बार मैं मदद नहीं कर पाऊँगी।",
    mr: "हा खूप छान प्रोजेक्ट वाटतो. अशा जागांसाठी स्पेशलिस्ट स्टुडिओ लागतो, आणि आम्ही घरं आणि ऑफिसवर काम करतो, त्यामुळे आम्ही योग्य पर्याय ठरणार नाही. माफ करा, या वेळी मी मदत करू शकणार नाही.",
  },
  commercial_too_small: {
    en: "For a space of that kind, our team isn't set up to give you the quality we'd want to promise. A designer who specialises in smaller workspaces would serve you better.",
    hi: "इस तरह की जगह के लिए हमारी टीम वह क्वालिटी नहीं दे पाएगी जिसका हम वादा करना चाहेंगे। छोटे वर्कस्पेस में माहिर कोई डिज़ाइनर आपके लिए बेहतर रहेगा।",
    mr: "अशा प्रकारच्या जागेसाठी आम्हाला अपेक्षित असलेली क्वालिटी आमची टीम देऊ शकणार नाही. छोट्या वर्कस्पेसमध्ये तज्ज्ञ असलेला डिझायनर तुमच्यासाठी जास्त योग्य ठरेल.",
  },
  timeline: {
    en: "I understand. We wouldn't want to rush it and disappoint you. If your timing changes, please call us again.",
    hi: "मैं समझती हूँ। हम जल्दबाज़ी में काम करके आपको निराश नहीं करना चाहेंगे। अगर आपका समय बदलता है, तो हमें फिर से कॉल कीजिए।",
    mr: "मी समजू शकते. घाईघाईत काम करून तुमची निराशा करायला आम्हाला आवडणार नाही. तुमचं वेळापत्रक बदललं, तर आम्हाला पुन्हा नक्की फोन करा.",
  },
  budget: {
    en: "Thank you for being open with me. I want to be honest: from what you've described, I don't think we'd be the right fit for this particular plan, and I'd rather tell you now than after a meeting. If your plans change, we'd be very happy to hear from you again.",
    hi: "खुलकर बताने के लिए धन्यवाद। मैं ईमानदारी से कहूँ तो, आपने जो बताया है उसके हिसाब से इस योजना के लिए हम सही विकल्प नहीं होंगे, और यह बात मैं मीटिंग के बाद नहीं, अभी बताना बेहतर समझती हूँ। अगर आपकी योजना बदलती है, तो हमें फिर से ज़रूर संपर्क कीजिए।",
    mr: "मोकळेपणाने सांगितल्याबद्दल धन्यवाद. खरं सांगायचं तर, तुम्ही जे सांगितलं त्यानुसार या योजनेसाठी आम्ही योग्य पर्याय ठरणार नाही, आणि हे मीटिंगनंतर नव्हे तर आत्ताच सांगणं मला योग्य वाटतं. तुमची योजना बदलली, तर आम्हाला पुन्हा नक्की संपर्क करा.",
  },
  generic: {
    en: "This sounds like it may not be the right fit for us right now — but feel free to reach out if your timeline or scope changes.",
    hi: "लगता है कि अभी हम इसके लिए सही विकल्प नहीं हैं, लेकिन अगर आपका समय या काम का दायरा बदलता है, तो बेझिझक हमसे संपर्क कीजिए।",
    mr: "सध्या आम्ही यासाठी योग्य पर्याय नाही असं वाटतं, पण तुमचं वेळापत्रक किंवा कामाचं स्वरूप बदललं, तर नक्की संपर्क करा.",
  },
};

export const CLARIFY_LINES: Record<ClarifyCode, Record<Lang, string>> = {
  scope: {
    en: "Are you looking for us to design and carry out the work, or mainly for some ideas and advice?",
    hi: "क्या आप चाहते हैं कि हम डिज़ाइन करें और काम भी पूरा करवाएँ, या आपको मुख्य रूप से कुछ आइडिया और सलाह चाहिए?",
    mr: "आम्ही डिझाइन करून काम प्रत्यक्ष करून द्यावं असं तुम्हाला हवं आहे, की मुख्यतः काही कल्पना आणि सल्ला हवा आहे?",
  },
  area: {
    en: "Which area of Pune is the property in?",
    hi: "प्रॉपर्टी पुणे के किस इलाके में है?",
    mr: "प्रॉपर्टी पुण्यातल्या कोणत्या भागात आहे?",
  },
  timeline_later: {
    en: "To do this properly, the design and the work on site need more time than that. Would a later completion date work for you?",
    hi: "इसे ठीक से करने के लिए डिज़ाइन और साइट के काम में इससे ज़्यादा समय लगता है। क्या थोड़ी बाद की तारीख़ आपके लिए ठीक रहेगी?",
    mr: "हे नीट करण्यासाठी डिझाइन आणि साइटवरच्या कामाला यापेक्षा जास्त वेळ लागतो. थोडी नंतरची तारीख तुम्हाला चालेल का?",
  },
};

export function lineFor(action: { decision: "decline"; code: DeclineCode } | { decision: "clarify"; code: ClarifyCode }, lang: Lang): string {
  return action.decision === "decline" ? DECLINE_LINES[action.code][lang] : CLARIFY_LINES[action.code][lang];
}

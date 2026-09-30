export type UiLang = "en-US" | "bn-BD" | "zh-CN" | "hi-IN";

export type UiCopy = {
  search: string;
  clearSearch: string;
  trending: string;
  recent: string;
  clear: string;
  h1: string;
  blurb: string;
  howTitle: string;
  how1: string;
  how2: string;
  how3before: string;
  howTo: string;
  how3mid: string;
  about: string;
  how3after: string;
  sourcesOff: string;
  web: string;
  wiki: string;
  grok: string;
  images: string;
  on: string;
  off: string;
  optional: string;
  nothing: string;
  searchFor: string;
  noResponse: string;
  nothingPage: string;
  noMatches: string;
  openNew: string;
  webNote: string;
  imagesNote: string;
  shareResults: string;
  previous: string;
  next: string;
  page: string;
  deepDive: string;
  aiAnswer: string;
  aiBadge: string;
  asking: string;
  writing: string;
  tryAgain: string;
  failedSo: string;
  writtenBy: string;
  checkSources: string;
  aiUnconfigured: string;
  aiNoContext: string;
  aiError: string;
  image: string;
  locations: string;
  locationsFailed: string;
  map: string;
  definitions: string;
  readArticle: string;
  aboutResults: string;
  resultOne: string;
  resultMany: string;
  footerSearch: string;
  footerAbout: string;
  footerPrivacy: string;
  footerHow: string;
  language: string;
  model: string;
  searchModels: string;
};

const en: UiCopy = {
  search: "Search",
  clearSearch: "Clear search",
  trending: "Trending now",
  recent: "Recent",
  clear: "Clear",
  h1: "Search the web, Wikipedia, and Grokipedia",
  blurb:
    "Search the web with Folio by Zip1. Explore web results and optional Wikipedia and Grokipedia sources from one simple search interface.",
  howTitle: "How Folio works",
  how1:
    "Type a query in the search bar and press the search button. The model menu in that bar chooses which model writes the short AI answer. Every search includes that answer, with numbered links to the results it used. The answer can be wrong or leave things out, so the lists under it are there to check.",
  how2:
    "Web results are included. Wikipedia and Grokipedia start on, and you can turn either one off. Images starts off. Turning it on adds pictures from Bing’s public image results. If Web, Wikipedia, Grokipedia, and Images are all off, the search button stays disabled until one of them is on again. After a search, those switches sit with the search box. On this page they stay hidden until every source is off.",
  how3before: "Select a result to open a preview in this window. Open page leaves Folio and goes to that address in the same window.",
  howTo: "How to search",
  how3mid: "explains the model menu, pages, and previews.",
  about: "About Folio",
  how3after: "explains what this site is and what it is not.",
  sourcesOff: "Turn on Web, Wikipedia, Grokipedia, or Images to search.",
  web: "Web",
  wiki: "Wikipedia",
  grok: "Grokipedia",
  images: "Images",
  on: "On",
  off: "Off",
  optional: "optional",
  nothing: "Nothing matched. Try fewer words, or switch on another source.",
  searchFor: "Search for",
  noResponse: "{source} didn’t respond. The other sources still ran.",
  nothingPage: "Nothing on this page.",
  noMatches: "No matches in {source}.",
  openNew: "Open {title} in a new tab",
  webNote: "Web listings via Bing’s public results feed.",
  imagesNote: "Images via Bing’s public image results, with SafeSearch set to moderate.",
  shareResults: "Share these results",
  previous: "Previous",
  next: "Next",
  page: "{label} page {n}",
  deepDive: "Deep dive into {topic}",
  aiAnswer: "AI answer",
  aiBadge: "AI-generated · can be wrong",
  asking: "Asking {model} for a short answer from the top results…",
  writing: "Writing a short answer from the top results…",
  tryAgain: "Try again",
  failedSo: "{failed} didn’t answer, so {provider} did.",
  writtenBy: "Written by {provider} ({model}) from the results on this page. It can be wrong or leave things out, so check the sources.",
  checkSources: "check the sources",
  aiUnconfigured: "AI answers aren’t set up yet.",
  aiNoContext: "AI answers need results from at least one source to work from.",
  aiError: "The AI answer didn’t load. The other sources still ran.",
  image: "Image",
  locations: "Location references",
  locationsFailed: "Location references didn’t load.",
  map: "Map",
  definitions: "Definitions",
  readArticle: "Read the article",
  aboutResults: "About {n} results",
  resultOne: "{n} result",
  resultMany: "{n} results",
  footerSearch: "Search",
  footerAbout: "About",
  footerPrivacy: "Privacy",
  footerHow: "How to search",
  language: "Language",
  model: "Model",
  searchModels: "Search models",
};

export const UI: Record<UiLang, UiCopy> = {
  "en-US": en,
  "zh-CN": {
    ...en,
    search: "搜索",
    clearSearch: "清除搜索",
    trending: "正在流行",
    recent: "最近",
    clear: "清除",
    h1: "搜索网页、维基百科和 Grokipedia",
    blurb: "用 Zip1 的 Folio 搜索网页。在一个简单的界面里查看网页结果，以及可选的维基百科和 Grokipedia。",
    howTitle: "Folio 如何工作",
    how1: "在搜索栏输入查询并按下搜索按钮。栏内的模型菜单决定由哪个模型写简短的 AI 回答。每次搜索都包含这个回答，并用数字链到它用过的结果。回答可能有错或有遗漏，所以下面的列表用来核对。",
    how2: "网页结果默认包含。维基百科和 Grokipedia 默认打开，可以关掉。图片默认关闭。打开后会加入 Bing 公开图片结果。如果网页、维基百科、Grokipedia 和图片都关闭，搜索按钮会保持禁用，直到重新打开其中一项。搜索之后，这些开关跟在搜索框旁边。在本页，它们会一直隐藏，直到所有来源都关闭。",
    how3before: "点一条结果，会在这个窗口里打开预览。打开页面会离开 Folio，并在同一窗口前往那个地址。",
    howTo: "如何搜索",
    how3mid: "说明模型菜单、翻页和预览。",
    about: "关于 Folio",
    how3after: "说明这个网站是什么，以及它不是什么。",
    sourcesOff: "请打开网页、维基百科、Grokipedia 或图片后再搜索。",
    web: "网页",
    wiki: "维基百科",
    grok: "Grokipedia",
    images: "图片",
    on: "开",
    off: "关",
    optional: "可选",
    nothing: "没有匹配。试着少用几个词，或打开另一个来源。",
    searchFor: "搜索",
    noResponse: "{source} 没有响应。其他来源仍已完成。",
    nothingPage: "这一页没有内容。",
    noMatches: "{source} 中没有匹配。",
    openNew: "在新标签页打开 {title}",
    webNote: "网页列表来自 Bing 的公开结果。",
    imagesNote: "图片来自 Bing 的公开图片结果，安全搜索设为中等。",
    shareResults: "分享这些结果",
    previous: "上一页",
    next: "下一页",
    page: "{label} 第 {n} 页",
    deepDive: "深入了解 {topic}",
    aiAnswer: "AI 回答",
    aiBadge: "AI 生成 · 可能有误",
    asking: "正在请 {model} 根据最前面的结果写一段简短回答…",
    writing: "正在根据最前面的结果写一段简短回答…",
    tryAgain: "重试",
    failedSo: "{failed} 没有回答，所以由 {provider} 来写。",
    writtenBy: "由 {provider}（{model}）根据本页结果写成。它可能有错或有遗漏，请核对来源。",
    checkSources: "核对来源",
    aiUnconfigured: "AI 回答尚未设置。",
    aiNoContext: "AI 回答至少需要一个来源的结果。",
    aiError: "AI 回答没有加载。其他来源仍已完成。",
    image: "图片",
    locations: "地点参考",
    locationsFailed: "地点参考没有加载。",
    map: "地图",
    definitions: "释义",
    readArticle: "阅读文章",
    aboutResults: "约 {n} 条结果",
    resultOne: "{n} 条结果",
    resultMany: "{n} 条结果",
    footerSearch: "搜索",
    footerAbout: "关于",
    footerPrivacy: "隐私",
    footerHow: "如何搜索",
    language: "语言",
    model: "模型",
    searchModels: "搜索模型",
  },
  "hi-IN": {
    ...en,
    search: "खोजें",
    clearSearch: "खोज मिटाएँ",
    trending: "अभी चर्चा में",
    recent: "हाल की",
    clear: "मिटाएँ",
    h1: "वेब, विकिपीडिया और Grokipedia खोजें",
    blurb: "Zip1 के Folio से वेब खोजें। एक सरल खोज में वेब परिणाम और वैकल्पिक विकिपीडिया तथा Grokipedia स्रोत देखें।",
    howTitle: "Folio कैसे काम करता है",
    how1: "खोज पट्टी में प्रश्न लिखें और खोज बटन दबाएँ। उसी पट्टी का मॉडल मेनू चुनता है कि छोटा AI उत्तर कौन सा मॉडल लिखे। हर खोज में वह उत्तर आता है, और जिन परिणामों का उसने उपयोग किया उनकी संख्या लिंक में होती है। उत्तर गलत हो सकता है या कुछ छोड़ सकता है, इसलिए नीचे की सूचियाँ जाँच के लिए हैं।",
    how2: "वेब परिणाम शामिल रहते हैं। विकिपीडिया और Grokipedia शुरू में चालू रहते हैं, और दोनों बंद किए जा सकते हैं। चित्र शुरू में बंद रहते हैं। चालू करने पर Bing के सार्वजनिक चित्र जुड़ते हैं। यदि वेब, विकिपीडिया, Grokipedia और चित्र सब बंद हों, तो खोज बटन तब तक निष्क्रिय रहता है जब तक एक स्रोत फिर चालू न हो। खोज के बाद ये स्विच खोज बॉक्स के साथ रहते हैं। इस पृष्ठ पर वे तब तक छिपे रहते हैं जब तक हर स्रोत बंद न हो।",
    how3before: "किसी परिणाम को चुनने पर इसी विंडो में पूर्वावलोकन खुलता है। पृष्ठ खोलें Folio छोड़कर उसी विंडो में उस पते पर जाता है।",
    howTo: "कैसे खोजें",
    how3mid: "मॉडल मेनू, पृष्ठ और पूर्वावलोकन समझाता है।",
    about: "Folio के बारे में",
    how3after: "बताता है कि यह साइट क्या है और क्या नहीं।",
    sourcesOff: "खोजने के लिए वेब, विकिपीडिया, Grokipedia या चित्र चालू करें।",
    web: "वेब",
    wiki: "विकिपीडिया",
    grok: "Grokipedia",
    images: "चित्र",
    on: "चालू",
    off: "बंद",
    optional: "वैकल्पिक",
    nothing: "कुछ नहीं मिला। कम शब्द आज़माएँ, या दूसरा स्रोत चालू करें।",
    searchFor: "खोज",
    noResponse: "{source} ने उत्तर नहीं दिया। बाकी स्रोत चलते रहे।",
    nothingPage: "इस पृष्ठ पर कुछ नहीं।",
    noMatches: "{source} में कोई मिलान नहीं।",
    openNew: "{title} नई टैब में खोलें",
    webNote: "वेब सूची Bing की सार्वजनिक परिणाम फ़ीड से है।",
    imagesNote: "चित्र Bing के सार्वजनिक चित्र परिणामों से हैं, SafeSearch मध्यम पर है।",
    shareResults: "ये परिणाम साझा करें",
    previous: "पिछला",
    next: "अगला",
    page: "{label} पृष्ठ {n}",
    deepDive: "{topic} की गहरी खोज",
    aiAnswer: "AI उत्तर",
    aiBadge: "AI द्वारा लिखा · गलत हो सकता है",
    asking: "शीर्ष परिणामों से छोटा उत्तर {model} से माँगा जा रहा है…",
    writing: "शीर्ष परिणामों से छोटा उत्तर लिखा जा रहा है…",
    tryAgain: "फिर कोशिश करें",
    failedSo: "{failed} ने उत्तर नहीं दिया, इसलिए {provider} ने दिया।",
    writtenBy: "{provider} ({model}) ने इस पृष्ठ के परिणामों से लिखा। यह गलत हो सकता है या कुछ छोड़ सकता है, इसलिए स्रोत जाँचें।",
    checkSources: "स्रोत जाँचें",
    aiUnconfigured: "AI उत्तर अभी सेट नहीं हैं।",
    aiNoContext: "AI उत्तर के लिए कम से कम एक स्रोत के परिणाम चाहिए।",
    aiError: "AI उत्तर लोड नहीं हुआ। बाकी स्रोत चलते रहे।",
    image: "चित्र",
    locations: "स्थान संदर्भ",
    locationsFailed: "स्थान संदर्भ लोड नहीं हुए।",
    map: "नक्शा",
    definitions: "परिभाषाएँ",
    readArticle: "लेख पढ़ें",
    aboutResults: "लगभग {n} परिणाम",
    resultOne: "{n} परिणाम",
    resultMany: "{n} परिणाम",
    footerSearch: "खोज",
    footerAbout: "परिचय",
    footerPrivacy: "गोपनीयता",
    footerHow: "कैसे खोजें",
    language: "भाषा",
    model: "मॉडल",
    searchModels: "मॉडल खोजें",
  },
  "bn-BD": {
    ...en,
    search: "খুঁজুন",
    clearSearch: "খোঁজ মুছুন",
    trending: "এখন আলোচিত",
    recent: "সাম্প্রতিক",
    clear: "মুছুন",
    h1: "ওয়েব, উইকিপিডিয়া ও Grokipedia খুঁজুন",
    blurb: "Zip1-এর Folio দিয়ে ওয়েব খুঁজুন। একটি সহজ খোঁজে ওয়েব ফল এবং ঐচ্ছিক উইকিপিডিয়া ও Grokipedia উৎস দেখুন।",
    howTitle: "Folio কীভাবে কাজ করে",
    how1: "খোঁজের ঘরে প্রশ্ন লিখে খোঁজ বোতাম চাপুন। সেই ঘরের মডেল মেনু ঠিক করে কোন মডেল ছোট AI উত্তর লিখবে। প্রতিটি খোঁজে সেই উত্তর থাকে, এবং যে ফল সে ব্যবহার করেছে তার নম্বর সংযোগ থাকে। উত্তর ভুল হতে পারে বা কিছু বাদ যেতে পারে, তাই নিচের তালিকা মিলিয়ে দেখার জন্য।",
    how2: "ওয়েব ফল থাকে। উইকিপিডিয়া ও Grokipedia শুরুতে চালু, দুটিই বন্ধ করা যায়। ছবি শুরুতে বন্ধ। চালু করলে Bing-এর প্রকাশ্য ছবি যোগ হয়। ওয়েব, উইকিপিডিয়া, Grokipedia ও ছবি সব বন্ধ থাকলে খোঁজ বোতাম নিষ্ক্রিয় থাকে, যতক্ষণ না একটি আবার চালু হয়। খোঁজের পর এই সুইচগুলো খোঁজের ঘরের সাথে থাকে। এই পাতায় সব উৎস বন্ধ না হওয়া পর্যন্ত সেগুলো লুকানো থাকে।",
    how3before: "একটি ফল বেছে নিলে এই উইন্ডোতে প্রিভিউ খোলে। পাতা খুলুন Folio ছেড়ে একই উইন্ডোতে সেই ঠিকানায় যায়।",
    howTo: "কীভাবে খুঁজবেন",
    how3mid: "মডেল মেনু, পাতা ও প্রিভিউ বোঝায়।",
    about: "Folio সম্পর্কে",
    how3after: "বোঝায় এই সাইট কী এবং কী নয়।",
    sourcesOff: "খোঁজার জন্য ওয়েব, উইকিপিডিয়া, Grokipedia বা ছবি চালু করুন।",
    web: "ওয়েব",
    wiki: "উইকিপিডিয়া",
    grok: "Grokipedia",
    images: "ছবি",
    on: "চালু",
    off: "বন্ধ",
    optional: "ঐচ্ছিক",
    nothing: "কিছু মেলেনি। কম শব্দ ব্যবহার করুন, বা অন্য উৎস চালু করুন।",
    searchFor: "খোঁজ",
    noResponse: "{source} সাড়া দেয়নি। অন্য উৎস চলেছে।",
    nothingPage: "এই পাতায় কিছু নেই।",
    noMatches: "{source}-এ কোনো মিল নেই।",
    openNew: "{title} নতুন ট্যাবে খুলুন",
    webNote: "ওয়েব তালিকা Bing-এর প্রকাশ্য ফল থেকে।",
    imagesNote: "ছবি Bing-এর প্রকাশ্য ছবির ফল থেকে, SafeSearch মাঝারি।",
    shareResults: "এই ফল শেয়ার করুন",
    previous: "আগের",
    next: "পরের",
    page: "{label} পাতা {n}",
    deepDive: "{topic} নিয়ে গভীর খোঁজ",
    aiAnswer: "AI উত্তর",
    aiBadge: "AI-এর লেখা · ভুল হতে পারে",
    asking: "শীর্ষ ফল থেকে ছোট উত্তরের জন্য {model}-কে বলা হচ্ছে…",
    writing: "শীর্ষ ফল থেকে ছোট উত্তর লেখা হচ্ছে…",
    tryAgain: "আবার চেষ্টা",
    failedSo: "{failed} উত্তর দেয়নি, তাই {provider} দিয়েছে।",
    writtenBy: "{provider} ({model}) এই পাতার ফল থেকে লিখেছে। এটি ভুল হতে পারে বা কিছু বাদ যেতে পারে, তাই উৎস মিলিয়ে দেখুন।",
    checkSources: "উৎস মিলিয়ে দেখুন",
    aiUnconfigured: "AI উত্তর এখনও সেট করা হয়নি।",
    aiNoContext: "AI উত্তরের জন্য অন্তত একটি উৎসের ফল দরকার।",
    aiError: "AI উত্তর লোড হয়নি। অন্য উৎস চলেছে।",
    image: "ছবি",
    locations: "স্থানের রেফারেন্স",
    locationsFailed: "স্থানের রেফারেন্স লোড হয়নি।",
    map: "মানচিত্র",
    definitions: "সংজ্ঞা",
    readArticle: "নিবন্ধ পড়ুন",
    aboutResults: "প্রায় {n}টি ফল",
    resultOne: "{n}টি ফল",
    resultMany: "{n}টি ফল",
    footerSearch: "খোঁজ",
    footerAbout: "পরিচিতি",
    footerPrivacy: "গোপনীয়তা",
    footerHow: "কীভাবে খুঁজবেন",
    language: "ভাষা",
    model: "মডেল",
    searchModels: "মডেল খুঁজুন",
  },
};

export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export function sourceLabel(copy: UiCopy, id: "web" | "wiki" | "grok" | "images"): string {
  if (id === "web") return copy.web;
  if (id === "wiki") return copy.wiki;
  if (id === "grok") return copy.grok;
  return copy.images;
}

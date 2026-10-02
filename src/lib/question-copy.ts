import type { UiLang } from "./i18n";
const rows: Record<UiLang, readonly [string, string, string]> = {
  "en-US": ["Ask a question directly, or turn on a source to find references.", "Asking {model} to answer your question…", "Answered by {provider} ({model}) without web references. AI answers can be wrong; verify important details."],
  "bn-BD": ["সরাসরি প্রশ্ন করুন, অথবা তথ্যসূত্র খুঁজতে একটি উৎস চালু করুন।", "{model} আপনার প্রশ্নের উত্তর দিচ্ছে…", "ওয়েব তথ্যসূত্র ছাড়া {provider} ({model}) উত্তর দিয়েছে। AI ভুল করতে পারে; গুরুত্বপূর্ণ তথ্য যাচাই করুন।"],
  "hi-IN": ["सीधे प्रश्न पूछें, या संदर्भ खोजने के लिए कोई स्रोत चालू करें।", "{model} आपके प्रश्न का उत्तर दे रहा है…", "{provider} ({model}) ने वेब संदर्भों के बिना उत्तर दिया। AI गलत हो सकता है; महत्वपूर्ण जानकारी जाँचें।"],
  "ar-SA": ["اطرح سؤالًا مباشرة، أو فعّل مصدرًا للعثور على مراجع.", "يجيب {model} عن سؤالك…", "أجاب {provider} ({model}) دون مراجع ويب. قد تخطئ الإجابات؛ تحقق من التفاصيل المهمة."],
  "es-ES": ["Haz una pregunta directamente o activa una fuente para buscar referencias.", "{model} está respondiendo a tu pregunta…", "Respuesta de {provider} ({model}) sin referencias web. La IA puede equivocarse; verifica los detalles importantes."],
  "fr-FR": ["Posez une question directement ou activez une source pour trouver des références.", "{model} répond à votre question…", "Réponse de {provider} ({model}) sans références web. L’IA peut se tromper ; vérifiez les détails importants."],
  "zh-CN": ["直接提问，或开启来源查找参考资料。", "{model} 正在回答你的问题…", "由 {provider}（{model}）回答，未使用网页参考资料。AI 可能出错，请核实重要信息。"],
  "ja-JP": ["直接質問するか、情報源を有効にして参考資料を探してください。", "{model} が質問に回答しています…", "{provider}（{model}）による回答です。ウェブの参考資料は使用していません。AIは間違えることがあるため、重要な情報は確認してください。"],
  "pt-BR": ["Faça uma pergunta diretamente ou ative uma fonte para buscar referências.", "{model} está respondendo à sua pergunta…", "Resposta de {provider} ({model}) sem referências da web. A IA pode errar; verifique os detalhes importantes."],
  "de-DE": ["Stelle direkt eine Frage oder aktiviere eine Quelle für Referenzen.", "{model} beantwortet deine Frage…", "Antwort von {provider} ({model}) ohne Webreferenzen. KI kann Fehler machen; prüfe wichtige Angaben."],
};
export function questionCopy(lang: UiLang) {
  const [noSources, asking, writtenBy] = rows[lang];
  const writing: Record<UiLang, string> = {
    "en-US": "Preparing your answer…", "bn-BD": "আপনার উত্তর প্রস্তুত হচ্ছে…",
    "hi-IN": "आपका उत्तर तैयार हो रहा है…", "ar-SA": "جارٍ إعداد إجابتك…",
    "es-ES": "Preparando tu respuesta…", "fr-FR": "Préparation de votre réponse…",
    "zh-CN": "正在准备回答…", "ja-JP": "回答を準備しています…",
    "pt-BR": "Preparando sua resposta…", "de-DE": "Deine Antwort wird vorbereitet…",
  };
  return { noSources, asking, writtenBy, writing: writing[lang] };
}

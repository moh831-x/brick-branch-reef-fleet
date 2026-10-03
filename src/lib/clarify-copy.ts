import type { UiLang } from "./i18n";

/** The clarifying question card above the prompt bar, and the suggested follow-ups under a reply. */
const rows: Record<UiLang, readonly [string, string, string, string, string, string, string]> = {
  "en-US": ["Question", "Custom answer", "Skip", "Done", "Close question", "Suggested follow-ups", "Press a letter to pick an answer."],
  "bn-BD": ["প্রশ্ন", "নিজের উত্তর", "এড়িয়ে যান", "সম্পন্ন", "প্রশ্ন বন্ধ করুন", "পরামর্শকৃত পরবর্তী প্রশ্ন", "উত্তর বেছে নিতে একটি অক্ষর চাপুন।"],
  "hi-IN": ["प्रश्न", "अपना उत्तर", "छोड़ें", "हो गया", "प्रश्न बंद करें", "सुझाए गए अगले प्रश्न", "उत्तर चुनने के लिए कोई अक्षर दबाएँ।"],
  "ar-SA": ["سؤال", "إجابة مخصصة", "تخطٍّ", "تم", "إغلاق السؤال", "أسئلة متابعة مقترحة", "اضغط حرفًا لاختيار إجابة."],
  "es-ES": ["Pregunta", "Respuesta personalizada", "Omitir", "Listo", "Cerrar pregunta", "Seguimientos sugeridos", "Pulsa una letra para elegir una respuesta."],
  "fr-FR": ["Question", "Réponse personnalisée", "Passer", "Terminé", "Fermer la question", "Suites suggérées", "Appuyez sur une lettre pour choisir une réponse."],
  "zh-CN": ["问题", "自定义回答", "跳过", "完成", "关闭问题", "推荐的追问", "按字母键选择答案。"],
  "ja-JP": ["質問", "自由に回答", "スキップ", "完了", "質問を閉じる", "おすすめの続きの質問", "文字キーで回答を選べます。"],
  "pt-BR": ["Pergunta", "Resposta personalizada", "Pular", "Concluir", "Fechar pergunta", "Sugestões de continuação", "Pressione uma letra para escolher uma resposta."],
  "de-DE": ["Frage", "Eigene Antwort", "Überspringen", "Fertig", "Frage schließen", "Vorgeschlagene Folgefragen", "Drücke einen Buchstaben, um eine Antwort zu wählen."],
};

export function clarifyCopy(lang: UiLang) {
  const [label, custom, skip, done, close, suggestions, keys] = rows[lang];
  return { label, custom, skip, done, close, suggestions, keys };
}

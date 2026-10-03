import type { UiLang } from "./i18n";
const rows: Record<UiLang, readonly [string, string, string, string, string, string, string]> = {
  "en-US": ["Continue the conversation", "Ask a follow-up…", "Send message", "New chat", "Copy answer", "Copied", "Chat stays on this page. Recent messages are sent to the selected AI model."],
  "bn-BD": ["কথোপকথন চালিয়ে যান", "আরেকটি প্রশ্ন করুন…", "বার্তা পাঠান", "নতুন চ্যাট", "উত্তর কপি করুন", "কপি হয়েছে", "চ্যাট এই পৃষ্ঠায় থাকে। সাম্প্রতিক বার্তাগুলো নির্বাচিত AI মডেলে পাঠানো হয়।"],
  "hi-IN": ["बातचीत जारी रखें", "अगला प्रश्न पूछें…", "संदेश भेजें", "नई चैट", "उत्तर कॉपी करें", "कॉपी किया", "चैट इस पृष्ठ पर रहती है। हाल के संदेश चुने हुए AI मॉडल को भेजे जाते हैं।"],
  "ar-SA": ["تابع المحادثة", "اطرح سؤالًا آخر…", "إرسال الرسالة", "محادثة جديدة", "نسخ الإجابة", "تم النسخ", "تبقى المحادثة في هذه الصفحة. تُرسل الرسائل الأخيرة إلى نموذج الذكاء الاصطناعي المختار."],
  "es-ES": ["Continúa la conversación", "Haz otra pregunta…", "Enviar mensaje", "Nuevo chat", "Copiar respuesta", "Copiado", "El chat permanece en esta página. Los mensajes recientes se envían al modelo de IA seleccionado."],
  "fr-FR": ["Continuez la conversation", "Posez une autre question…", "Envoyer le message", "Nouvelle discussion", "Copier la réponse", "Copié", "La discussion reste sur cette page. Les messages récents sont envoyés au modèle d’IA sélectionné."],
  "zh-CN": ["继续对话", "追问…", "发送消息", "新对话", "复制回答", "已复制", "对话保留在此页面。最近的消息会发送给所选 AI 模型。"],
  "ja-JP": ["会話を続ける", "続けて質問する…", "メッセージを送信", "新しいチャット", "回答をコピー", "コピー済み", "チャットはこのページに残ります。最近のメッセージは選択したAIモデルに送信されます。"],
  "pt-BR": ["Continue a conversa", "Faça outra pergunta…", "Enviar mensagem", "Novo chat", "Copiar resposta", "Copiado", "O chat permanece nesta página. As mensagens recentes são enviadas ao modelo de IA selecionado."],
  "de-DE": ["Gespräch fortsetzen", "Stelle eine Folgefrage…", "Nachricht senden", "Neuer Chat", "Antwort kopieren", "Kopiert", "Der Chat bleibt auf dieser Seite. Die letzten Nachrichten werden an das gewählte KI-Modell gesendet."],
};
/** The one search bar in follow-up mode: its chip, the way back to searching, and the hint under a conversation. */
const barRows: Record<UiLang, readonly [string, string, string]> = {
  "en-US": ["Follow-up", "New search", "Type in the search bar"],
  "bn-BD": ["পরবর্তী প্রশ্ন", "নতুন অনুসন্ধান", "সার্চ বারে লিখুন"],
  "hi-IN": ["अगला प्रश्न", "नई खोज", "खोज बार में लिखें"],
  "ar-SA": ["سؤال متابعة", "بحث جديد", "اكتب في شريط البحث"],
  "es-ES": ["Seguimiento", "Nueva búsqueda", "Escribe en la barra de búsqueda"],
  "fr-FR": ["Suite", "Nouvelle recherche", "Écrivez dans la barre de recherche"],
  "zh-CN": ["追问", "新搜索", "在搜索栏中输入"],
  "ja-JP": ["続けて質問", "新しい検索", "検索バーに入力"],
  "pt-BR": ["Continuação", "Nova pesquisa", "Digite na barra de pesquisa"],
  "de-DE": ["Folgefrage", "Neue Suche", "In die Suchleiste tippen"],
};
export function chatCopy(lang: UiLang) {
  const [title, placeholder, send, newChat, copy, copied, privacy] = rows[lang];
  const start: Record<UiLang, string> = {
    "en-US": "Chat with AI", "bn-BD": "AI-এর সাথে চ্যাট করুন", "hi-IN": "AI से चैट करें", "ar-SA": "الدردشة مع الذكاء الاصطناعي", "es-ES": "Chatea con IA", "fr-FR": "Discuter avec l’IA", "zh-CN": "与 AI 对话", "ja-JP": "AIとチャット", "pt-BR": "Converse com IA", "de-DE": "Mit KI chatten",
  };
  const [followUp, newSearch, inBar] = barRows[lang];
  return { title, placeholder, send, newChat, copy, copied, privacy, start: start[lang], followUp, newSearch, inBar };
}

/** Follow-up requests use the existing conversation and its cited sources. */
export const followUpPrompts: Record<UiLang, readonly string[]> = {
  "en-US": ["Explain the key points in more detail.", "What evidence supports this answer?", "What other perspectives should I consider?"],
  "bn-BD": ["মূল বিষয়গুলো আরও বিস্তারিত ব্যাখ্যা করুন।", "এই উত্তরের পক্ষে কী প্রমাণ আছে?", "আর কোন দৃষ্টিভঙ্গি বিবেচনা করা উচিত?"],
  "hi-IN": ["मुख्य बिंदुओं को विस्तार से समझाएँ।", "इस उत्तर के समर्थन में क्या प्रमाण हैं?", "मुझे किन अन्य दृष्टिकोणों पर विचार करना चाहिए?"],
  "ar-SA": ["اشرح النقاط الرئيسية بمزيد من التفصيل.", "ما الأدلة التي تدعم هذه الإجابة؟", "ما وجهات النظر الأخرى التي ينبغي مراعاتها؟"],
  "es-ES": ["Explica los puntos clave con más detalle.", "¿Qué pruebas respaldan esta respuesta?", "¿Qué otras perspectivas debería considerar?"],
  "fr-FR": ["Explique les points clés plus en détail.", "Quelles preuves étayent cette réponse ?", "Quels autres points de vue devrais-je considérer ?"],
  "zh-CN": ["请更详细地解释要点。", "有哪些证据支持这个回答？", "我还应该考虑哪些观点？"],
  "ja-JP": ["要点をさらに詳しく説明してください。", "この回答を裏付ける根拠は何ですか？", "他にどのような視点を考慮すべきですか？"],
  "pt-BR": ["Explique os pontos principais com mais detalhes.", "Quais evidências sustentam esta resposta?", "Que outras perspectivas devo considerar?"],
  "de-DE": ["Erkläre die wichtigsten Punkte ausführlicher.", "Welche Belege stützen diese Antwort?", "Welche anderen Perspektiven sollte ich berücksichtigen?"],
};

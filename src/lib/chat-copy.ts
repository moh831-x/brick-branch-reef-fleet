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
export function chatCopy(lang: UiLang) {
  const [title, placeholder, send, newChat, copy, copied, privacy] = rows[lang];
  const start: Record<UiLang, string> = {
    "en-US": "Chat with AI", "bn-BD": "AI-এর সাথে চ্যাট করুন", "hi-IN": "AI से चैट करें", "ar-SA": "الدردشة مع الذكاء الاصطناعي", "es-ES": "Chatea con IA", "fr-FR": "Discuter avec l’IA", "zh-CN": "与 AI 对话", "ja-JP": "AIとチャット", "pt-BR": "Converse com IA", "de-DE": "Mit KI chatten",
  };
  return { title, placeholder, send, newChat, copy, copied, privacy, start: start[lang] };
}

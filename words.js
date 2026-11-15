/* Curated bilingual starter index. IDs are assigned in order by app.js. */
window.WORD_CATEGORIES = [
  { id: "technology", en: "Technology", ar: "التكنولوجيا", icon: "⌘", color: "blue" },
  { id: "health", en: "Health & Medicine", ar: "الصحة والطب", icon: "+", color: "green" },
  { id: "business", en: "Business & Finance", ar: "الأعمال والمال", icon: "↗", color: "amber" },
  { id: "science", en: "Science", ar: "العلوم", icon: "⚛", color: "purple" },
  { id: "education", en: "Education", ar: "التعليم", icon: "▤", color: "blue" },
  { id: "daily", en: "Daily Life", ar: "الحياة اليومية", icon: "⌂", color: "rose" },
  { id: "travel", en: "Travel & Places", ar: "السفر والأماكن", icon: "✈", color: "cyan" },
  { id: "environment", en: "Environment", ar: "البيئة", icon: "❋", color: "green" },
  { id: "food", en: "Food & Cooking", ar: "الطعام والطبخ", icon: "◒", color: "amber" },
  { id: "communication", en: "Communication", ar: "التواصل", icon: "◎", color: "purple" },
  { id: "emotions", en: "People & Feelings", ar: "الناس والمشاعر", icon: "♡", color: "rose" },
  { id: "society", en: "Society & Law", ar: "المجتمع والقانون", icon: "⚖", color: "slate" }
];

/* word | Arabic meaning | part of speech | category */
const rows = [
  // Technology
  ["algorithm", "خوارزمية", "noun", "technology"], ["artificial intelligence", "الذكاء الاصطناعي", "noun", "technology"],
  ["application", "تطبيق", "noun", "technology"], ["browser", "متصفح", "noun", "technology"],
  ["cloud computing", "الحوسبة السحابية", "noun", "technology"], [" database", "قاعدة بيانات", "noun", "technology"],
  ["encryption", "تشفير", "noun", "technology"], ["hardware", "مكونات الحاسوب المادية", "noun", "technology"],
  ["interface", "واجهة", "noun", "technology"], ["machine learning", "تعلّم الآلة", "noun", "technology"],
  ["network", "شبكة", "noun", "technology"], ["operating system", "نظام تشغيل", "noun", "technology"],
  ["programming", "برمجة", "noun", "technology"], ["software", "برمجيات", "noun", "technology"],
  ["source code", "الكود المصدري", "noun", "technology"], ["cybersecurity", "الأمن السيبراني", "noun", "technology"],
  ["data", "بيانات", "noun", "technology"], ["robotics", "علم الروبوتات", "noun", "technology"],
  // Health
  ["allergy", "حساسية", "noun", "health"], ["appointment", "موعد طبي", "noun", "health"],
  ["blood pressure", "ضغط الدم", "noun", "health"], ["diagnosis", "تشخيص", "noun", "health"],
  ["disease", "مرض", "noun", "health"], ["emergency", "حالة طارئة", "noun", "health"],
  ["exercise", "تمرين رياضي", "noun", "health"], ["immune system", "الجهاز المناعي", "noun", "health"],
  ["infection", "عدوى", "noun", "health"], ["medication", "دواء", "noun", "health"],
  ["nutrition", "التغذية", "noun", "health"], ["patient", "مريض", "noun", "health"],
  ["recovery", "التعافي", "noun", "health"], ["symptom", "عَرَض مرضي", "noun", "health"],
  ["treatment", "علاج", "noun", "health"], ["well-being", "العافية", "noun", "health"],
  // Business & finance
  ["asset", "أصل مالي", "noun", "business"], ["budget", "ميزانية", "noun", "business"],
  ["client", "عميل", "noun", "business"], ["competition", "منافسة", "noun", "business"],
  ["contract", "عقد", "noun", "business"], ["customer", "زبون / عميل", "noun", "business"],
  ["deadline", "موعد نهائي", "noun", "business"], ["investment", "استثمار", "noun", "business"],
  ["invoice", "فاتورة", "noun", "business"], ["market", "سوق", "noun", "business"],
  ["negotiation", "تفاوض", "noun", "business"], ["profit", "ربح", "noun", "business"],
  ["revenue", "إيرادات", "noun", "business"], ["salary", "راتب", "noun", "business"],
  ["strategy", "استراتيجية", "noun", "business"], ["entrepreneur", "رائد أعمال", "noun", "business"],
  // Science
  ["atom", "ذرة", "noun", "science"], ["chemical", "مادة كيميائية", "noun", "science"],
  ["climate", "مناخ", "noun", "science"], ["compound", "مركّب", "noun", "science"],
  ["energy", "طاقة", "noun", "science"], ["experiment", "تجربة", "noun", "science"],
  ["force", "قوة", "noun", "science"], ["gravity", "جاذبية", "noun", "science"],
  ["hypothesis", "فرضية", "noun", "science"], ["molecule", "جزيء", "noun", "science"],
  ["organism", "كائن حي", "noun", "science"], ["physics", "فيزياء", "noun", "science"],
  ["research", "بحث علمي", "noun", "science"], ["species", "نوع / فصيلة", "noun", "science"],
  ["theory", "نظرية", "noun", "science"], ["universe", "الكون", "noun", "science"],
  // Education
  ["academic", "أكاديمي", "adjective", "education"], ["assignment", "تكليف دراسي", "noun", "education"],
  ["certificate", "شهادة", "noun", "education"], ["curriculum", "منهج دراسي", "noun", "education"],
  ["degree", "درجة علمية", "noun", "education"], ["exam", "امتحان", "noun", "education"],
  ["graduate", "خريج", "noun", "education"], ["lecture", "محاضرة", "noun", "education"],
  ["scholarship", "منحة دراسية", "noun", "education"], ["semester", "فصل دراسي", "noun", "education"],
  ["skill", "مهارة", "noun", "education"], ["syllabus", "مقرر / خطة دراسية", "noun", "education"],
  ["tuition", "رسوم دراسية", "noun", "education"], ["workshop", "ورشة عمل", "noun", "education"],
  // Daily life
  ["errand", "مشوار لقضاء غرض", "noun", "daily"], ["choice", "اختيار", "noun", "daily"],
  ["convenient", "ملائم / مناسب", "adjective", "daily"], ["habit", "عادة", "noun", "daily"],
  ["household", "منزلي / أسري", "adjective", "daily"], ["journey", "رحلة", "noun", "daily"],
  ["lifestyle", "نمط حياة", "noun", "daily"], ["opportunity", "فرصة", "noun", "daily"],
  ["purchase", "شراء", "noun", "daily"], ["routine", "روتين يومي", "noun", "daily"],
  ["schedule", "جدول / مواعيد", "noun", "daily"], ["solution", "حل", "noun", "daily"],
  ["task", "مهمة", "noun", "daily"], ["valuable", "قيّم / ذو قيمة", "adjective", "daily"],
  // Travel
  ["accommodation", "مكان الإقامة", "noun", "travel"], ["arrival", "وصول", "noun", "travel"],
  ["booking", "حجز", "noun", "travel"], ["destination", "وجهة", "noun", "travel"],
  ["departure", "مغادرة", "noun", "travel"], ["flight", "رحلة جوية", "noun", "travel"],
  ["itinerary", "خط سير الرحلة", "noun", "travel"], ["landmark", "مَعلَم بارز", "noun", "travel"],
  ["luggage", "أمتعة", "noun", "travel"], ["passport", "جواز سفر", "noun", "travel"],
  ["reservation", "حجز مسبق", "noun", "travel"], ["route", "مسار / طريق", "noun", "travel"],
  ["sightseeing", "مشاهدة المعالم السياحية", "noun", "travel"], ["transportation", "وسائل النقل", "noun", "travel"],
  // Environment
  ["biodiversity", "التنوع البيولوجي", "noun", "environment"], ["carbon footprint", "البصمة الكربونية", "noun", "environment"],
  ["conservation", "الحفاظ على الموارد", "noun", "environment"], ["deforestation", "إزالة الغابات", "noun", "environment"],
  ["ecosystem", "نظام بيئي", "noun", "environment"], ["emission", "انبعاث", "noun", "environment"],
  ["fossil fuel", "وقود أحفوري", "noun", "environment"], ["global warming", "الاحتباس الحراري", "noun", "environment"],
  ["habitat", "موطن طبيعي", "noun", "environment"], ["pollution", "تلوث", "noun", "environment"],
  ["recycling", "إعادة التدوير", "noun", "environment"], ["renewable energy", "طاقة متجددة", "noun", "environment"],
  // Food
  ["ingredient", "مكوّن", "noun", "food"], ["appetite", "شهية", "noun", "food"],
  ["boil", "يغلي", "verb", "food"], ["chop", "يُقطّع", "verb", "food"],
  ["cuisine", "مطبخ / فن الطهي", "noun", "food"], ["flavor", "نكهة", "noun", "food"],
  ["fresh", "طازج", "adjective", "food"], ["grill", "يشوي", "verb", "food"],
  ["recipe", "وصفة طعام", "noun", "food"], ["seasoning", "توابل", "noun", "food"],
  ["slice", "شريحة / يقطّع شرائح", "noun", "food"], ["spicy", "حارّ", "adjective", "food"],
  // Communication
  ["announcement", "إعلان", "noun", "communication"], ["audience", "جمهور", "noun", "communication"],
  ["conversation", "محادثة", "noun", "communication"], ["feedback", "ملاحظات / تغذية راجعة", "noun", "communication"],
  ["headline", "عنوان رئيسي", "noun", "communication"], ["interview", "مقابلة", "noun", "communication"],
  ["message", "رسالة", "noun", "communication"], ["persuade", "يقنع", "verb", "communication"],
  ["presentation", "عرض تقديمي", "noun", "communication"], ["statement", "تصريح / بيان", "noun", "communication"],
  ["translate", "يترجم", "verb", "communication"], ["vocabulary", "مفردات", "noun", "communication"],
  // People & feelings
  ["ambitious", "طموح", "adjective", "emotions"], ["anxiety", "قلق", "noun", "emotions"],
  ["confidence", "ثقة بالنفس", "noun", "emotions"], ["courage", "شجاعة", "noun", "emotions"],
  ["curiosity", "فضول", "noun", "emotions"], ["disappointed", "محبط / خائب الأمل", "adjective", "emotions"],
  ["empathy", "تعاطف", "noun", "emotions"], ["generous", "كريم", "adjective", "emotions"],
  ["grateful", "ممتن", "adjective", "emotions"], ["inspiration", "إلهام", "noun", "emotions"],
  ["patience", "صبر", "noun", "emotions"], ["reliable", "يمكن الاعتماد عليه", "adjective", "emotions"],
  // Society & law
  ["agreement", "اتفاق", "noun", "society"], ["authority", "سلطة", "noun", "society"],
  ["citizen", "مواطن", "noun", "society"], ["community", "مجتمع محلي", "noun", "society"],
  ["evidence", "دليل / إثبات", "noun", "society"], ["freedom", "حرية", "noun", "society"],
  ["government", "حكومة", "noun", "society"], ["identity", "هوية", "noun", "society"],
  ["justice", "عدالة", "noun", "society"], ["law", "قانون", "noun", "society"],
  ["privacy", "خصوصية", "noun", "society"], ["responsibility", "مسؤولية", "noun", "society"]
];

window.WORDS = rows.map((row, index) => ({
  id: String(index + 1).padStart(3, "0"),
  en: row[0].trim(),
  ar: row[1],
  pos: row[2],
  category: row[3]
}));

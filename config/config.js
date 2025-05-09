const isDevelopment = process.env.NODE_ENV === 'development';
const domain = 'booktranslator.ai';
export const baseUrl = isDevelopment ? "http://localhost:3000" : `https://${domain}`;

export const openAIModel = {
    premium: {
        name: 'gpt-4o',
        // tokenLimit and costs/prices will be managed in llmConfig
    },
    basic: { // This was gpt-4o-mini
        name: 'gpt-4o-mini',
        // tokenLimit and costs/prices will be managed in llmConfig
    },
    // This openAIModel structure can likely be deprecated in favor of llmConfig.
};

export const llmConfig = {
    activeProvider: 'openai', // Options: 'openai', 'gemini', 'claude'
    providers: {
        openai: {
            activeModel: 'o4-mini', // Options: 'o4-mini', 'premium', etc.
            standardPromptTemplate: 'You are an expert multilingual translator. Your primary task is to translate the provided text into {targetLanguage}.\n\nKey Instructions:\n1.  **Accuracy:** Translate the meaning accurately, considering the context of the entire input.\n2.  **Structure Preservation:** Meticulously preserve the original HTML/Markdown structure. This includes all tags, attributes, and formatting. Do not add, remove, or alter these structural elements in any way.\n3.  **Content Integrity:** Translate only the textual content. Do not alter or translate URLs, email addresses, code snippets, or placeholder values (e.g., `{{variable_name}}`, `%s`, `:[placeholder]`). These must remain exactly as in the original.\n4.  **No External Text:** Do not add any introductory phrases, explanations, personal opinions, or concluding remarks not present in the original text.\n5.  **Output Format:** Provide only the translated text, maintaining the original line breaks and spacing where semantically appropriate for the translated language and format.\n\nText to translate:\n---\n{content}\n---',
            jsonPromptTemplate: 'You are an expert multilingual translator specializing in JSON content. Your task is to translate user-facing textual values within the following JSON string to {targetLanguage}.\n\nCRITICAL INSTRUCTIONS: Adhere to these rules strictly for a valid and correctly translated JSON output.\n1.  **JSON Structure Unchanged:** PRESERVE THE EXACT JSON STRUCTURE. Do not add, remove, or reorder any keys. The output MUST be a perfectly valid JSON object that mirrors the original structure.\n2.  **Key Non-Translation:** DO NOT TRANSLATE JSON keys (e.g., "headline", "titleKey", "slug"). Keys must remain identical to the original.\n3.  **Selective Value Translation:**\n    *   **TRANSLATE:** Only human-readable string values clearly intended for end-user display or comprehension (e.g., descriptions, titles, messages).\n    *   **DO NOT TRANSLATE:** Numerical values (integers, floats), boolean values (true, false), URLs, email addresses, file paths, date strings, version numbers, identifiers (IDs, UUIDs), slugs, or any strings that are clearly programmatic, represent codes, or are not natural language text for users.\n4.  **Output Purity:** Output ONLY the raw, translated, fully valid JSON string. Do not include any explanations, comments, apologies, markdown formatting (including ```json fences or any other ```), or any surrounding text whatsoever. The response must start with `{` and end with `}` (or `[` and `]` if the root is an array).\n\nOriginal JSON to translate:\n```json\n{jsonString}\n```',
            defaultApiSettings: {
                temperature: 0.7,
                system: "You are a highly skilled, meticulous, and professional multilingual translator. Your primary language for translation will be from English to {targetLanguage}, unless specified otherwise by the user\'s instructions. You must consider the entire context of the provided text or data structure to ensure the most accurate and nuanced translation. It is critical that you preserve all original formatting (such as HTML, Markdown, JSON structure) and any non-translatable elements (like code, placeholders, URLs) precisely as they appear in the source. Your goal is to produce a translation that is not only linguistically accurate but also structurally identical to the original where applicable."
                // maxTokens will be set by getActiveLlmClient based on the active model's outputTokenLimit by default
            },
            models: {
                'o4-mini': {
                    name: 'gpt-4o-mini',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 16384
                },
                premium: {
                    name: 'gpt-4o',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 4096
                },
                'gpt-4.5': {
                    name: 'gpt-4.5-turbo',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 4096
                },
                'gpt-4.1': {
                    name: 'gpt-4.1',
                    inputTokenLimit: 1000000,
                    outputTokenLimit: 8192
                },
                'gpt-4.1-mini': {
                    name: 'gpt-4.1-mini',
                    inputTokenLimit: 1000000,
                    outputTokenLimit: 16384
                },
                o1: {
                    name: 'o1',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 8192
                },
                'o1-mini': {
                    name: 'o1-mini',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 16384
                },
                'gpt-4.1-nano': {
                    name: 'gpt-4.1-nano',
                    inputTokenLimit: 1000000,
                    outputTokenLimit: 16384
                },
                'o3-mini': {
                    name: 'o3-mini',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 8192
                },
                'gpt-4o-mini-audio': {
                    name: 'gpt-4o-mini',
                    inputTokenLimit: 128000,
                    outputTokenLimit: 16384
                }
            }
        },
        gemini: {
            activeModel: 'flash', // Options: 'flash', 'pro'
            standardPromptTemplate: 'Translate the following text to {targetLanguage}. Strict instructions: Preserve the original HTML/Markdown structure and formatting. Do not output any text other than the direct translation. Do not add any introductory phrases, explanations, or concluding remarks. Text to translate:\n---\n{content}\n---',
            jsonPromptTemplate: 'Translate the user-facing textual values within the following JSON string to {targetLanguage}. \nStrict instructions: \n1. PRESERVE THE EXACT JSON STRUCTURE. Do not add, remove, or reorder keys. \n2. DO NOT TRANSLATE JSON keys (e.g., "headline", "slug"). \n3. DO NOT TRANSLATE non-textual values such as numbers, booleans, URLs, or strings that look like IDs/slugs. \n4. Only translate human-readable string values that represent content. \n5. Output ONLY the translated, fully valid JSON string. Do not include any explanations, markdown formatting, code block syntax, or surrounding text.\nOriginal JSON to translate:\n```json\n{jsonString}\n```\n',
            defaultApiSettings: {
                temperature: 0.8,
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                ]
            },
            models: {
                flash: {
                    name: 'gemini-2.5-flash-preview-04-17',
                    inputTokenLimit: 1048576,
                    outputTokenLimit: 65536
                },
                pro: {
                    name: 'gemini-2.5-pro-preview-05-06',
                    inputTokenLimit: 1048576,
                    outputTokenLimit: 65536
                }
            }
        },
        claude: {
            activeModel: 'sonnet-3.5',
            standardPromptTemplate: 'Please translate the following text into {targetLanguage}. It is crucial that you preserve the original HTML/Markdown structure and formatting. Do not include any prefatory remarks or explanations. Return only the translated text itself.\n\n<document_to_translate>\n{content}\n</document_to_translate>',
            jsonPromptTemplate: 'Please translate the user-facing textual values within the following JSON string to {targetLanguage}. \nIt is crucial that you: \n1. PRESERVE THE EXACT JSON STRUCTURE. Do not add, remove, or reorder keys. \n2. DO NOT TRANSLATE JSON keys (e.g., "headline", "slug"). \n3. DO NOT TRANSLATE non-textual values such as numbers, booleans, URLs, or strings that look like IDs/slugs. \n4. Only translate human-readable string values that represent content. \n5. Output ONLY the translated, fully valid JSON string. Do not include any explanations, markdown formatting, code block syntax, or surrounding text.\nOriginal JSON to translate:\n```json\n{jsonString}\n```\n',
            defaultApiSettings: {
                temperature: 0.7,
                system: "You are a precise and careful translation model. You follow instructions meticulously."
            },
            models: {
                'sonnet-3.7': {
                    name: 'claude-3-7-sonnet-20250219',
                    inputTokenLimit: 200000,
                    outputTokenLimit: 64000
                },
                'sonnet-3.5-latest': {
                    name: 'claude-3-5-sonnet-20241022',
                    inputTokenLimit: 200000,
                    outputTokenLimit: 8192
                },
                'sonnet-3.5': {
                    name: 'claude-3-5-sonnet-20240620',
                    inputTokenLimit: 200000,
                    outputTokenLimit: 8192
                },
                'haiku-3.5': {
                    name: 'claude-3-5-haiku-20241022',
                    inputTokenLimit: 200000,
                    outputTokenLimit: 8192
                }
            }
        }
    }
};

export const TARGET_LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'pt-br', 'zh', 'ru', 'nl', 'pl', 'sv', 'ko', 'ar', 'hi'];

export const MINIMUM_PRICES = {
    basic: 5.99,
    premium: 9.99
}

export const TRANSLATION_STATUS = {
    WAITING_FOR_PAYMENT: 'waitingForPayment',
    WAITING_FOR_TRANSLATION: 'waitingForTranslation',
    IN_TRANSLATION: 'inTranslation',
    TRANSLATION_FINISHED: 'translationFinished',
    PENDING_TRANSLATION: 'pendingTranslation',
    TRANSLATED: 'translated',
    ERROR_TRANSLATING: 'errorTranslating',
    ERROR: 'error'
}

export const footerLinks = [
    { href: "/faq", text: "FAQ" },
    { href: "/about", text: "About" },
    { href: "/terms", text: "Terms of Service" },
    { href: "/privacy", text: "Privacy Policy" }
]

export const blogConfig = {
    // Core app information
    appName: "BookTranslator.ai",
    appDescription: "AI-powered epub book translation. Translate epub books in 50+ languages with the help of AI and read them in your native language.",
    domainName: isDevelopment ? "localhost:3000" : "booktranslator.ai",

    // Blog specific configuration
    blog: {
        postsPerPage: 6,
        defaultAuthor: {
            name: "BookTranslator Team",
            image: "/images/team/avatar.png",
            job: "AI Translation Experts"
        },
        categories: [
            { slug: "tutorials", title: "Translation Tutorials" },
            { slug: "updates", title: "Product Updates" },
            { slug: "guides", title: "Translation Guides" }
        ],
        forceSync: false,
    },

    // SEO and metadata
    seo: {
        metaImage: "/og-image.jpg",
        twitter: {
            handle: "@booktranslator",
            site: "@booktranslator",
            cardType: "summary_large_image",
        },
    },

    // Storage configuration for blog images
    storage: {
        blogImagesBucket: "booktranslatorai",
        blogImagesPath: "blog-images"
    }
};

export const config = {
    // Your config values here
    siteUrl: isDevelopment ? 'http://localhost:3000' : 'https://booktranslator.ai',
    // ... other config values
};

// Add a default export
export default config;
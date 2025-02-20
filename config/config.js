const isDevelopment = process.env.NODE_ENV === 'development';
const domain = 'booktranslator.ai';
export const baseUrl = isDevelopment ? "http://localhost:3000" : `https://${domain}`;
 
export const openAIModel = {
    premium: {
        name: 'gpt-4o',
        tokenLimit: 16384,
        costsPerToken: 10 / 1000000,
        pricePerToken: 40 / 1000000
    },
    basic: {
        name: 'gpt-4o-mini',
        tokenLimit: 16384,
        costsPerToken: 0.600 / 1000000,
        pricePerToken: 20 / 1000000
    }
}


export const MINIMUM_PRICES = {
    basic: 5.99,
    premium: 9.99
}

export const TRANSLATION_STATUS = {
    WAITING_FOR_PAYMENT: 'waitingForPayment',
    WAITING_FOR_TRANSLATION: 'waitingForTranslation',
    IN_TRANSLATION: 'inTranslation',
    TRANSLATION_FINISHED: 'translationFinished',
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
        ]
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
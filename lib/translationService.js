import { TARGET_LANGUAGES, TRANSLATION_STATUS, llmConfig } from '../config/config.js';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { prisma } from './prisma.js'; // 💡 use shared Prisma client with Neon adapter
import { slugify as transliterateSlugify } from 'transliteration';

// const prisma = new PrismaClient(); // Removed local PrismaClient instantiation

/**
 * Retrieves the active LLM client and its configuration based on llmConfig.
 * @returns {{ llmClient: object, modelName: string, providerKey: string, inputTokenLimit: number, outputTokenLimit: number }}
 * @throws {Error} If configuration is invalid.
 */
function getActiveLlmClient(targetLanguage) {
    const providerKey = llmConfig.activeProvider;
    const providerConfig = llmConfig.providers[providerKey];

    if (!providerConfig) {
        throw new Error(`❌ [getActiveLlmClient] Configuration for provider "${providerKey}" not found in llmConfig.`);
    }

    const modelKey = providerConfig.activeModel;
    const modelDetails = providerConfig.models[modelKey];

    if (!modelDetails || !modelDetails.name) {
        throw new Error(`❌ [getActiveLlmClient] Configuration for model "${modelKey}" under provider "${providerKey}" is missing or invalid.`);
    }

    let llmClient;
    switch (providerKey) {
        case 'openai':
            llmClient = openai(modelDetails.name);
            break;
        case 'gemini':
            llmClient = google(modelDetails.name);
            break;
        case 'claude':
            llmClient = anthropic(modelDetails.name);
            break;
        default:
            throw new Error(`❌ [getActiveLlmClient] Unsupported provider key configured: "${providerKey}"`);
    }

    const inputTokenLimit = typeof modelDetails.inputTokenLimit === 'number' && modelDetails.inputTokenLimit > 0 ? modelDetails.inputTokenLimit : 8000;
    const outputTokenLimit = typeof modelDetails.outputTokenLimit === 'number' && modelDetails.outputTokenLimit > 0 ? modelDetails.outputTokenLimit : 2048;
    if (modelDetails.inputTokenLimit <= 0 || modelDetails.outputTokenLimit <= 0) {
        console.warn(`🟡 [getActiveLlmClient] Invalid token limits for ${providerKey}/${modelDetails.name}. Using defaults: Input ${inputTokenLimit}, Output ${outputTokenLimit}.`);
    }

    // Prepare API settings, starting with a default for maxTokens
    let resolvedApiSettings = {
        maxTokens: outputTokenLimit,
        ...(providerConfig.defaultApiSettings || {})
    };

    // Format system prompt if it exists and targetLanguage is provided
    if (resolvedApiSettings.system && typeof resolvedApiSettings.system === 'string' && targetLanguage) {
        resolvedApiSettings.system = resolvedApiSettings.system.replace('{targetLanguage}', targetLanguage);
    }

    // Validate prompt templates
    if (typeof providerConfig.standardPromptTemplate !== 'string' || typeof providerConfig.jsonPromptTemplate !== 'string') {
        throw new Error(`❌ [getActiveLlmClient] Prompt templates for provider "${providerKey}" are missing or invalid.`);
    }

    return {
        llmClient,
        providerKey,
        modelName: modelDetails.name,
        inputTokenLimit,
        outputTokenLimit,
        standardPromptTemplate: providerConfig.standardPromptTemplate,
        jsonPromptTemplate: providerConfig.jsonPromptTemplate,
        apiSettings: resolvedApiSettings
    };
}

/**
 * Generates a URL-friendly slug from a string.
 * @param {string} text The text to slugify.
 * @param {string} [fallback] Optional fallback (e.g., article ID) if slug is empty.
 * @returns {string} The slugified string.
 */
function slugify(text, fallback = '') {
    if (!text) return fallback;
    const slug = transliterateSlugify(text, { lowercase: true, separator: '-' });
    if (!slug) {
        console.log('⚠️ [slugify] Slug is empty after transliteration, using fallback:', fallback);
        return fallback;
    }
    console.log('🔤 [slugify] Generated slug:', slug);
    return slug;
}

// 👇 cleaner for all LLM outputs ─ strips ```/'''/--- wrappers
const CODE_FENCE_START = /^(```(?:html)?)\s*/;
const CODE_FENCE_END = /\s*(```)$/;
function cleanTranslatedText(raw = '') {
    let txt = String(raw == null ? '' : raw).trim();

    // Correctly strip YAML-like front-matter if the LLM mirrors the prompt structure
    const yamlFence = '---';
    if (txt.startsWith(yamlFence)) {
        // Find the first newline after the initial ---
        const firstNewlinePos = txt.indexOf('\n');
        // Ensure the part before the first newline is indeed just "---"
        if (firstNewlinePos > -1 && txt.substring(0, firstNewlinePos).trim() === yamlFence) {
            // Now find the last newline that precedes a final ---
            const lastNewlinePos = txt.lastIndexOf('\n');
            if (lastNewlinePos > firstNewlinePos && txt.substring(lastNewlinePos + 1).trim() === yamlFence) {
                // Extract content between the first newline and last newline
                txt = txt.substring(firstNewlinePos + 1, lastNewlinePos).trim();
            }
            // If the structure is just "---" on one line, then content, then "---" on another,
            // or if it's just "---" then content and no clear end, this specific logic might not strip.
            // This is targeted at the "---\nCONTENT\n---" structure.
        }
    }

    // Strip ```lang / '''lang code fences
    // This part remains similar to original, removing matched fences.
    // If the content was *only* fences, txt might become empty here.
    txt = txt.replace(CODE_FENCE_START, '').replace(CODE_FENCE_END, '');

    return txt.trim();
}

/**
 * @param {string} content The HTML or Markdown content to translate.
 * @param {string} targetLanguage The language code to translate to (e.g., 'fr', 'es').
 * @param {string} articleId The ID of the article being translated (for logging).
 * @param {string} contentType The type of content being translated (e.g., 'headline', 'html') for logging.
 * @returns {Promise<string|null>} The translated content, or null if translation fails.
 */
export async function translateArticleContent(content, targetLanguage, articleId, contentType) {
    let activeLlmDetails;
    try {
        // Pass targetLanguage here if your system prompt in config needs it (like OpenAI's does now)
        activeLlmDetails = getActiveLlmClient(targetLanguage);
    } catch (configError) {
        console.error(`🔴 [TranslationService] translateArticleContent: Failed to get LLM configuration for article ${articleId}, type: ${contentType}. Error: ${configError.message}`);
        return null;
    }
    const { llmClient, providerKey, modelName, standardPromptTemplate, apiSettings } = activeLlmDetails;

    if (!content || String(content).trim() === '') {
        console.warn(`🟡 [TranslationService] translateArticleContent: No content provided for article ${articleId}, type: ${contentType}, language: ${targetLanguage}. Skipping translation for this part.`);
        return null; // Return null if content is empty or just whitespace, can be handled by caller
    }

    if (!TARGET_LANGUAGES.includes(targetLanguage)) {
        console.warn(`🟡 [TranslationService] translateArticleContent: Unsupported target language '${targetLanguage}' for article ${articleId}, type: ${contentType}. Supported: ${TARGET_LANGUAGES.join(', ')}`);
        return null;
    }

    console.log(`🔵 [TranslationService] translateArticleContent: Starting translation for article ${articleId}, type: ${contentType}, to ${targetLanguage}. Provider: ${providerKey}, Model: ${modelName}`);

    const filledPrompt = standardPromptTemplate
        .replace('{targetLanguage}', targetLanguage)
        .replace('{content}', content);

    try {
        const { text: translatedText, finishReason, usage } = await generateText({
            model: llmClient,
            prompt: filledPrompt,
            ...apiSettings // Spread the resolved API settings
        });

        console.log(`ℹ️ [TranslationService] translateArticleContent: API call finished for article ${articleId}, type: ${contentType}, to ${targetLanguage}. Provider: ${providerKey}, Model: ${modelName}. Finish reason: ${finishReason}. Usage: ${JSON.stringify(usage)} tokens.`);

        // 'STOP' is a good sign, meaning the model finished generating naturally.
        // 'MAX_TOKENS' means it might have been cut off.
        // Other reasons (SAFETY, RECITATION, OTHER) might indicate issues.
        if (finishReason === 'MAX_TOKENS') {
            console.warn(`🟡 [TranslationService] translateArticleContent: Translation for article ${articleId}, type: ${contentType}, to ${targetLanguage} may be incomplete. Finish reason: MAX_TOKENS.`);
        } else if (finishReason !== 'STOP') {
            console.warn(`🟡 [TranslationService] translateArticleContent: Translation for article ${articleId}, type: ${contentType}, to ${targetLanguage} finished with reason: ${finishReason}. Review might be needed.`);
        }

        if (!translatedText || translatedText.trim() === "") {
            console.warn(`🟡 [TranslationService] translateArticleContent: Empty translation received from API for article ${articleId}, type: ${contentType}, to ${targetLanguage}.`);
            return null;
        }

        const cleanedText = cleanTranslatedText(translatedText);
        console.assert(
            cleanedText.length,
            `🟥 [TranslationService] cleanTranslatedText produced empty output for article ${articleId}, type: ${contentType}, lang: ${targetLanguage}`
        );

        console.log(`🟢 [TranslationService] translateArticleContent: Successfully translated article ${articleId}, type: ${contentType}, to ${targetLanguage}.`);
        return cleanedText;

    } catch (error) {
        console.error(`🔴 [TranslationService] translateArticleContent: Error translating article ${articleId}, type: ${contentType}, to ${targetLanguage}. Provider: ${providerKey}, Model: ${modelName}.`);
        if (error.message) console.error(`Error message: ${error.message}`);
        if (error.stack) console.error(`Error stack: ${error.stack}`);
        if (error.response && error.response.data) {
            console.error("Error response data:", JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

/**
 * Attempts to translate textual content within a JSON string, preserving its structure.
 * WARNING: Relies on LLM to correctly interpret and preserve structure. HIGH RISK of malformed JSON or incorrect translations.
 * @param {object|Array<any>} jsonObject The JavaScript object or array to translate.
 * @param {string} targetLanguage The language code to translate to.
 * @param {string} articleId For logging context.
 * @param {string} fieldName For logging context (e.g., 'tags', 'category').
 * @returns {Promise<object|Array<any>|null>} The translated object/array, or null if translation failed or produced invalid JSON.
 */
async function translateJsonPreservingStructure(jsonObject, targetLanguage, articleId, fieldName) {
    let activeLlmDetails;
    try {
        // Pass targetLanguage here if your system prompt in config needs it
        activeLlmDetails = getActiveLlmClient(targetLanguage);
    } catch (configError) {
        console.error(`🔴 [TranslationService] translateJsonPreservingStructure: Failed to get LLM configuration for article ${articleId}, field ${fieldName}. Error: ${configError.message}`);
        return null;
    }
    const { llmClient, providerKey, modelName, jsonPromptTemplate, apiSettings } = activeLlmDetails;

    if (jsonObject === null || typeof jsonObject === 'undefined') {
        console.log(`⚪️ [TranslationService] translateJsonPreservingStructure: JSON object for article ${articleId}, field ${fieldName} is null or undefined. Skipping.`);
        return null; // Or return jsonObject if you want to pass through nulls explicitly
    }
    if (typeof jsonObject !== 'object') {
        console.warn(`🟡 [TranslationService] translateJsonPreservingStructure: Expected an object/array for article ${articleId}, field ${fieldName}, but got ${typeof jsonObject}. Skipping.`);
        return jsonObject; // Return as-is if not an object/array
    }
    if (Object.keys(jsonObject).length === 0 && !Array.isArray(jsonObject)) { // Empty object
        console.log(`⚪️ [TranslationService] translateJsonPreservingStructure: JSON object for article ${articleId}, field ${fieldName} is empty. Skipping.`);
        return jsonObject;
    }
    if (Array.isArray(jsonObject) && jsonObject.length === 0) { // Empty array
        console.log(`⚪️ [TranslationService] translateJsonPreservingStructure: JSON array for article ${articleId}, field ${fieldName} is empty. Skipping.`);
        return jsonObject;
    }

    const originalJsonString = JSON.stringify(jsonObject, null, 2);
    console.log(`🔵 [TranslationService] translateJsonPreservingStructure: Attempting to translate JSON content for article ${articleId}, field ${fieldName}, to ${targetLanguage}. Provider: ${providerKey}, Model: ${modelName}`);

    const filledJsonPrompt = jsonPromptTemplate
        .replace('{targetLanguage}', targetLanguage)
        .replace('{jsonString}', originalJsonString);

    try {
        const { text: translatedJsonString, finishReason } = await generateText({
            model: llmClient,
            prompt: filledJsonPrompt,
            ...apiSettings // Spread the resolved API settings
        });

        if (finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
            console.warn(`🟡 [TranslationService] translateJsonPreservingStructure: API call for article ${articleId}, field ${fieldName} to ${targetLanguage} (Provider: ${providerKey}, Model: ${modelName}) finished with reason: ${finishReason}.`);
        }

        if (!translatedJsonString || translatedJsonString.trim() === '') {
            console.warn(`🟡 [TranslationService] translateJsonPreservingStructure: Empty JSON string received from API for article ${articleId}, field ${fieldName}, to ${targetLanguage}. Falling back to original.`);
            return null; // Signal fallback to original
        }

        // Clean the response by removing any markdown code block formatting that might be present
        // Re-use shared cleaner so JSON structure remains intact
        const cleanedJsonString = cleanTranslatedText(translatedJsonString);

        try {
            const parsedTranslatedJson = JSON.parse(cleanedJsonString);
            console.log(`🟢 [TranslationService] translateJsonPreservingStructure: Successfully translated and parsed JSON for article ${articleId}, field ${fieldName}, to ${targetLanguage}.`);
            return parsedTranslatedJson;
        } catch (parseError) {
            console.error(`🔴 CRITICAL [TranslationService] translateJsonPreservingStructure: Failed to parse translated JSON string for article ${articleId}, field ${fieldName}, to ${targetLanguage}. Provider: ${providerKey}, Model: ${modelName}. Clean Output: ${cleanedJsonString}. Original AI Output: ${translatedJsonString}. Parse Error: ${parseError.message}. Falling back to original.`);
            return null; // Signal fallback to original
        }
    } catch (apiError) {
        console.error(`🔴 [TranslationService] translateJsonPreservingStructure: API error translating JSON for article ${articleId}, field ${fieldName}, to ${targetLanguage}. Provider: ${providerKey}, Model: ${modelName}: ${apiError.message}. Falling back to original.`);
        if (apiError.stack) console.error(apiError.stack);
        return null; // Signal fallback to original
    }
}

/**
 * Processes a single translation job for an article part (e.g., headline, html).
 * This function is intended to be called by translateArticleToAllLanguages.
 * @param {object} params
 * @param {string} params.articleId The ID of the parent ArticleList.
 * @param {string} params.language The target language code.
 * @param {string} params.originalArticle The original article object.
 * @returns {Promise<boolean>} True if translation was successfully processed and saved, false otherwise.
 */
async function createAndProcessTranslation({ articleId, language, originalArticle }) {
    console.log(`🔵 [TranslationService] createAndProcessTranslation: Starting process for article ${articleId} to ${language}.`);

    let translationEntry;
    try {
        // Initial data for the translation record
        const initialTranslationData = {
            articleId: articleId,
            language: language,
            // Placeholders for translated content
            slug: "",
            headline: "",
            html: "",
            // Copy non-translatable or complex-to-translate fields from original
            image: originalArticle.image || null,
            myImageUrl: originalArticle.myImageUrl || null,
            tags: originalArticle.tags || [],
            category: originalArticle.category || {},
            readingTime: originalArticle.readingTime || 0,
            blog: originalArticle.blog || {},
            relatedPosts: originalArticle.relatedPosts || [],
            published: false, // Default for new translations
            publishedAt: null,
            status: TRANSLATION_STATUS.PENDING_TRANSLATION,
            // Fields to be translated or generated will be updated below
            metaKeywords: originalArticle.metaKeywords, // Will be translated
            outline: originalArticle.outline, // Will be translated
        };

        translationEntry = await prisma.articleTranslation.create({ data: initialTranslationData });
        console.log(`ℹ️ [TranslationService] createAndProcessTranslation: Created pending DB entry ${translationEntry.id} for article ${articleId} to ${language}.`);

        await prisma.articleTranslation.update({
            where: { id: translationEntry.id },
            data: { status: TRANSLATION_STATUS.IN_TRANSLATION },
        });
        console.log(`ℹ️ [TranslationService] createAndProcessTranslation: Status to IN_TRANSLATION for ${translationEntry.id}.`);

        // Translate content fields
        const translatedHeadline = await translateArticleContent(originalArticle.headline, language, articleId, "headline");
        if (!translatedHeadline) {
            console.error(`🔴 [TranslationService] createAndProcessTranslation: Failed to translate essential content (Headline) for article ${articleId} to ${language}. DB entry: ${translationEntry.id}. Cannot generate slug.`);
            await prisma.articleTranslation.update({
                where: { id: translationEntry.id },
                data: { status: TRANSLATION_STATUS.ERROR_TRANSLATING, updatedAt: new Date() },
            });
            return false;
        }

        const translatedSlug = slugify(translatedHeadline, articleId); // Generate slug from translated headline
        const translatedHtml = await translateArticleContent(originalArticle.html, language, articleId, "html");
        const translatedMetaDescription = originalArticle.metaDescription ? await translateArticleContent(originalArticle.metaDescription, language, articleId, "metaDescription") : null;
        const translatedMarkdown = originalArticle.markdown ? await translateArticleContent(originalArticle.markdown, language, articleId, "markdown") : null;
        const translatedMetaKeywords = originalArticle.metaKeywords ? await translateArticleContent(originalArticle.metaKeywords, language, articleId, "metaKeywords") : null;
        const translatedOutline = originalArticle.outline ? await translateArticleContent(originalArticle.outline, language, articleId, "outline") : null;

        // Translate JSON fields using the new method
        const translatedTags = await translateJsonPreservingStructure(originalArticle.tags, language, articleId, "tags");
        const translatedCategory = await translateJsonPreservingStructure(originalArticle.category, language, articleId, "category");
        const translatedRelatedPosts = await translateJsonPreservingStructure(originalArticle.relatedPosts, language, articleId, "relatedPosts");

        if (!translatedHtml) { // Headline already checked
            console.error(`🔴 [TranslationService] createAndProcessTranslation: Failed to translate essential content (HTML) for article ${articleId} to ${language}. DB entry: ${translationEntry.id}.`);
            await prisma.articleTranslation.update({
                where: { id: translationEntry.id },
                data: { status: TRANSLATION_STATUS.ERROR_TRANSLATING, updatedAt: new Date() },
            });
            return false;
        }

        await prisma.articleTranslation.update({
            where: { id: translationEntry.id },
            data: {
                slug: translatedSlug,
                headline: translatedHeadline,
                html: translatedHtml,
                metaDescription: translatedMetaDescription,
                markdown: translatedMarkdown,
                metaKeywords: translatedMetaKeywords,
                outline: translatedOutline,
                // Use translated JSON if successful, otherwise fallback to original (already in initialTranslationData for creation)
                // For update, we explicitly set it to translated or original if translation returned null
                tags: translatedTags !== null ? translatedTags : originalArticle.tags || [],
                category: translatedCategory !== null ? translatedCategory : originalArticle.category || {},
                relatedPosts: translatedRelatedPosts !== null ? translatedRelatedPosts : originalArticle.relatedPosts || [],
                // image, myImageUrl, readingTime, blog are already set from original during creation and not re-translated here
                status: TRANSLATION_STATUS.TRANSLATED,
                published: true, // Set published to true when translation is finished
                updatedAt: new Date(),
            },
        });
        console.log(`🟢 [TranslationService] createAndProcessTranslation: Successfully translated and saved article ${articleId} to ${language}. DB entry: ${translationEntry.id}. Slug: ${translatedSlug}`);
        return true;

    } catch (error) {
        console.error(`🔴 [TranslationService] createAndProcessTranslation: General error for article ${articleId} to ${language}. DB entry ID (if created): ${translationEntry ? translationEntry.id : 'N/A'}. Error: ${error.message}`);
        if (error.stack) console.error(error.stack);
        if (translationEntry) {
            try {
                await prisma.articleTranslation.update({
                    where: { id: translationEntry.id },
                    data: { status: TRANSLATION_STATUS.ERROR_TRANSLATING, updatedAt: new Date() },
                });
                console.log(`ℹ️ [TranslationService] createAndProcessTranslation: Updated status to ERROR_TRANSLATING for DB entry ${translationEntry.id} due to caught error.`);
            } catch (dbError) {
                console.error(`🔴 CRITICAL [TranslationService] createAndProcessTranslation: Failed to update status to ERROR_TRANSLATING for ${translationEntry.id}. DB Error: ${dbError.message}`);
            }
        }
        return false;
    }
}

/**
 * Translates a given article to all target languages defined in the config.
 * This is intended to be called after a new article is synced from SEObot and saved to ArticleList.
 * @param {object} articleFromDb The ArticleList object from Prisma (must include id, headline, html, metaDescription, markdown).
 */
export async function translateArticleToAllLanguages(articleFromDb) {
    if (!articleFromDb || !articleFromDb.id) {
        console.error("🔴 [TranslationService] translateArticleToAllLanguages: Invalid article object provided.", articleFromDb);
        return;
    }

    // Assuming 'en' is the original language of articles from SEObot.
    // If the original language can vary, this logic would need to be more dynamic,
    // potentially by storing original_language in ArticleList.
    const originalLanguage = 'en';

    console.log(`🔵 [TranslationService] translateArticleToAllLanguages: Starting translations for article ${articleFromDb.id} (${articleFromDb.headline}). Original language assumed: ${originalLanguage}.`);

    for (const lang of TARGET_LANGUAGES) {
        if (lang === originalLanguage) {
            console.log(`⏭️ [TranslationService] translateArticleToAllLanguages: Skipping translation for article ${articleFromDb.id} to its original language: ${lang}.`);
            continue; // Skip if the target language is the same as the original
        }

        console.log(`⏳ [TranslationService] translateArticleToAllLanguages: Processing article ${articleFromDb.id} for language: ${lang}.`);
        await createAndProcessTranslation({
            articleId: articleFromDb.id,
            language: lang,
            originalArticle: articleFromDb
        });
        // According to user's request, we process translations sequentially for each language
        // before moving to the next article. So, we await each language's translation process here.
    }
    console.log(`🟢 [TranslationService] translateArticleToAllLanguages: Finished all language translations for article ${articleFromDb.id}.`);
}


// Example usage (for testing purposes, can be removed or commented out)
/*
async function testFullArticleTranslation() {
    // Mock an article object as it would come from Prisma
    const mockArticle = {
        id: "test-article-id-12345",
        headline: "Hello World! This is a Test Article",
        html: "<h1>Hello World!</h1><p>This is a <strong>test</strong> document. It has some interesting content.</p>",
        metaDescription: "A short summary of this amazing test article about worlds and greetings.",
        markdown: "# Hello World!\n\nThis is a **test** document."
    };

    console.log("🧪 [Test] Starting full article translation test...");
    await translateArticleToAllLanguages(mockArticle);
    console.log("🧪 [Test] Full article translation test finished.");

    // Test with minimal content
    const mockArticleMinimal = {
        id: "test-article-minimal-67890",
        headline: "Minimal Test",
        html: "<p>Test</p>",
        metaDescription: null, // Test with null metaDescription
        markdown: null
    };
    console.log("🧪 [Test] Starting minimal article translation test...");
    await translateArticleToAllLanguages(mockArticleMinimal);
    console.log("🧪 [Test] Minimal article translation test finished.");
}

// To run the test:
// 1. Ensure your .env file has GOOGLE_GENERATIVE_AI_API_KEY
// 2. Ensure your database is migrated and Prisma client is generated.
// 3. Uncomment the line below and run this file directly (e.g., node lib/translationService.js)
// testFullArticleTranslation().catch(console.error);
*/ 
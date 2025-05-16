import { prisma } from "@/lib/prisma";
import { BlogClient } from "seobot";
import { bucket } from "@/lib/GCS";
import { NextResponse } from "next/server";
import { baseUrl, blogConfig } from "@/config/config";
import { translateArticleToAllLanguages } from "@/lib/translationService";

// --- TEMPORARY DEBUG LOG REMOVED ---
// console.log("[DEBUG BlogSync Route] DATABASE_URL:", process.env.DATABASE_URL);
// --- END TEMPORARY DEBUG LOG REMOVED ---

async function downloadAndUploadImage(imageUrl, fileName) {
    console.log('🖼️ Processing image:', imageUrl);
    try {
        if (!process.env.GCS_BUCKET_NAME || !process.env.GCS_PROJECT_ID) {
            console.error('❌ GCS configuration missing');
            return imageUrl; // Fallback to original URL
        }
        // Check if image already exists in GCS
        const file = bucket.file(fileName);
        const [exists] = await file.exists();

        if (exists) {
            console.log('✅ Image already exists in GCS');
            const [url] = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            return url;
        }

        // Download image with longer timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(imageUrl, {
            signal: controller.signal,
            timeout: 10000 // 10 second timeout
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('Failed to fetch image');
        const buffer = await response.arrayBuffer();

        // Upload to GCS with retry logic
        let retries = 3;
        while (retries > 0) {
            try {
                await file.save(Buffer.from(buffer), {
                    contentType: response.headers.get('content-type'),
                    timeout: 10000 // 10 second timeout for upload
                });
                break;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                console.log(`⚠️ Upload failed, retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            }
        }

        // Get signed URL
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        console.log('✅ Image uploaded successfully');
        return url;
    } catch (error) {
        console.error('❌ Image processing error:', error);
        return imageUrl; // Fallback to original URL on error
    }
}

async function processArticleBatch(articles, client, existingArticles, forceSync = false) {
    console.log(`🔄 Processing batch of ${articles.length} articles`);

    if (!Array.isArray(articles)) {
        console.error('❌ Invalid articles data received');
        return { success: false, error: 'Invalid articles data' };
    }

    // Filter out articles that haven't changed (unless force sync is enabled)
    const articlesToProcess = forceSync ? articles : articles.filter(article => {
        const existing = existingArticles.find(e => e.slug === article.slug);
        return !existing || new Date(article.updatedAt) > new Date(existing.updatedAt);
    });

    if (articlesToProcess.length === 0) {
        console.log('✨ No articles need updating in this batch');
        return { success: true, skipped: true };
    }

    console.log(`📝 Processing ${articlesToProcess.length} changed articles`);

    // Process all articles in the batch
    const results = [];
    for (const article of articlesToProcess) {
        try {
            if (!article.slug) {
                console.error('❌ Article missing required slug, skipping...');
                continue;
            }

            const existing = existingArticles.find(e => e.slug === article.slug);
            console.log(`📝 Processing article: ${article.slug}`);

            // Get full article content with retry logic
            let fullArticle = null;
            let retries = 3;
            while (retries > 0) {
                try {
                    console.log(`🔍 Fetching full content for: ${article.slug} (attempt ${4 - retries}/3)`);
                    fullArticle = await client.getArticle(article.slug);
                    if (!fullArticle || !fullArticle.html) {
                        console.warn(`🟡 Article with slug '${article.slug}' from SEObot did not contain HTML content. Skipping.`);
                        continue;
                    }
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) {
                        console.error(`❌ Failed to fetch article after 3 attempts: ${error.message}`);
                        // Use existing content or empty strings as fallback
                        fullArticle = {
                            html: existing?.html || '',
                            outline: existing?.outline || '',
                            markdown: existing?.markdown || ''
                        };
                    } else {
                        console.log(`⚠️ Fetch failed, retrying... (${retries} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                    }
                }
            }

            // Process related posts
            let relatedPosts = [];
            if (article.relatedPosts) {
                console.log(`🔗 Processing related posts for ${article.slug}:`, article.relatedPosts);

                // Normalize input to always be an array
                const relatedPostsInput = Array.isArray(article.relatedPosts)
                    ? article.relatedPosts
                    : (typeof article.relatedPosts === 'object' && article.relatedPosts !== null)
                        ? [article.relatedPosts]
                        : [];

                if (relatedPostsInput.length === 0 && existing?.relatedPosts?.length > 0) {
                    console.log('📎 Using existing related posts as no new ones provided');
                    relatedPosts = existing.relatedPosts;
                } else {
                    // Process each related post
                    const processedPosts = await Promise.all(relatedPostsInput.map(async (relatedPost) => {
                        try {
                            // If it's already a full post object with required fields
                            if (relatedPost?.slug && relatedPost?.headline) {
                                console.log(`✅ Using existing data for related post: ${relatedPost.slug}`);
                                return {
                                    id: relatedPost.id || `related-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    slug: relatedPost.slug,
                                    headline: relatedPost.headline,
                                    image: relatedPost.image || null,
                                    publishedAt: new Date(relatedPost.publishedAt || relatedPost.createdAt || Date.now()).toISOString(),
                                    excerpt: relatedPost.metaDescription || relatedPost.excerpt || ''
                                };
                            }

                            // Extract slug from various possible formats
                            const slug = typeof relatedPost === 'string'
                                ? relatedPost
                                : relatedPost?.slug || null;

                            if (!slug) {
                                console.warn('⚠️ Invalid related post data:', relatedPost);
                                return null;
                            }

                            // Fetch full post data
                            console.log(`🔍 Fetching data for related post: ${slug}`);
                            const relatedArticle = await client.getArticle(slug);

                            if (!relatedArticle?.slug || !relatedArticle?.headline) {
                                console.warn(`⚠️ Invalid article data fetched for slug: ${slug}`);
                                return null;
                            }

                            return {
                                id: `related-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                slug: relatedArticle.slug,
                                headline: relatedArticle.headline,
                                image: relatedArticle.image || null,
                                publishedAt: new Date(relatedArticle.publishedAt || relatedArticle.createdAt || Date.now()).toISOString(),
                                excerpt: relatedArticle.metaDescription || ''
                            };
                        } catch (error) {
                            console.error(`❌ Error processing related post:`, error);
                            // Try to use existing related post data if available
                            if (existing?.relatedPosts?.length > 0) {
                                const existingRelated = existing.relatedPosts.find(p =>
                                    p.slug === (typeof relatedPost === 'string' ? relatedPost : relatedPost?.slug)
                                );
                                if (existingRelated) {
                                    console.log(`📎 Falling back to existing data for: ${existingRelated.slug}`);
                                    return existingRelated;
                                }
                            }
                            return null;
                        }
                    }));

                    // Filter out null values and ensure unique entries
                    relatedPosts = processedPosts
                        .filter(post => post !== null)
                        .filter((post, index, self) =>
                            index === self.findIndex(p => p.slug === post.slug)
                        );
                }

                console.log(`✅ Processed ${relatedPosts.length} related posts for: ${article.slug}`);
                console.log('📊 Related posts data:', JSON.stringify(relatedPosts, null, 2));
            }

            // Ensure relatedPosts is always an array, never an empty object
            if (!Array.isArray(relatedPosts)) {
                console.warn('⚠️ Invalid relatedPosts format, resetting to empty array');
                relatedPosts = [];
            }

            // Handle image with proper error handling
            let finalMyImageUrl = existing?.myImageUrl; // Start with existing GCS URL or undefined
            if (article.image && (!existing || article.image !== existing.image)) { // Check if image exists and is new/updated
                console.log(`🔄 Attempting to process image for ${article.slug}`);
                try {
                    const fileName = `blog/${article.slug}-${Date.now()}.jpg`;
                    const potentialGcsUrl = await downloadAndUploadImage(article.image, fileName);

                    // Check if the returned URL is *actually* a GCS URL and not the fallback original URL
                    const isGcsUrl = potentialGcsUrl && potentialGcsUrl.includes('storage.googleapis.com');

                    if (isGcsUrl && potentialGcsUrl !== article.image) {
                        finalMyImageUrl = potentialGcsUrl; // Successfully uploaded/retrieved GCS URL
                        console.log(`✅ Successfully obtained GCS URL for ${article.slug}`);
                    } else {
                        // Handle cases where downloadAndUploadImage failed internally or returned fallback
                        console.warn(`⚠️ Image processing for ${article.slug} did not return a valid GCS URL. Retaining existing GCS URL or null.`);
                        finalMyImageUrl = existing?.myImageUrl || null; // Keep existing or set null
                    }
                } catch (error) { // Catch explicit errors thrown by downloadAndUploadImage
                    console.error(`❌ Explicit error during image processing for ${article.slug}: ${error.message}`);
                    finalMyImageUrl = existing?.myImageUrl || null; // Revert to existing GCS URL or null on explicit error
                }
            } else if (article.image && existing && article.image === existing.image) {
                console.log(`⏭️ Image for ${article.slug} is unchanged. Retaining existing GCS URL: ${finalMyImageUrl}`);
                // Keep the existing finalMyImageUrl
            } else if (!article.image) {
                console.log(`🗑️ No image provided for ${article.slug}. Setting GCS URL to null.`);
                finalMyImageUrl = null; // No image, so no GCS URL
            }

            // Prepare article data with validation
            const articleData = {
                headline: article.headline || 'Untitled',
                metaDescription: article.metaDescription || '',
                metaKeywords: article.keywords
                    ? Array.isArray(article.keywords)
                        ? article.keywords.join(', ')
                        : article.keywords
                    : article.tags
                        ? Array.isArray(article.tags)
                            ? article.tags.map(tag => tag.title || tag).join(', ')
                            : article.tags
                        : '',
                published: true,
                publishedAt: new Date(article.publishedAt || article.createdAt || Date.now()),
                updatedAt: new Date(article.updatedAt || Date.now()),
                image: article.image ? JSON.parse(JSON.stringify(article.image)) : null,
                myImageUrl: finalMyImageUrl, // Use the final determined GCS URL or null
                tags: article.tags ? JSON.parse(JSON.stringify(article.tags)) : [],
                category: article.category ? JSON.parse(JSON.stringify(article.category)) : {},
                readingTime: article.readingTime || 0,
                blog: article.blog ? JSON.parse(JSON.stringify(article.blog)) : {},
                relatedPosts: relatedPosts.length > 0 ? JSON.parse(JSON.stringify(relatedPosts)) : [],
                html: fullArticle?.html || existing?.html || '',
                outline: fullArticle?.outline || existing?.outline || '',
                markdown: fullArticle?.markdown || existing?.markdown || ''
            };

            // Log the final article data for debugging
            console.log('📄 Final article data:', {
                ...articleData,
                html: '(truncated)',
                markdown: '(truncated)',
                outline: '(truncated)'
            });

            // Validate required fields
            if (!articleData.html || !articleData.headline) {
                console.error(`❌ Missing required fields for article: ${article.slug}`);
                continue;
            }

            // Upsert article with retry logic
            let upsertRetries = 3;
            while (upsertRetries > 0) {
                try {
                    await prisma.articleList.upsert({
                        where: { slug: article.slug },
                        update: articleData,
                        create: {
                            slug: article.slug,
                            ...articleData
                        }
                    });
                    console.log(`✅ Article upserted to DB: ${article.slug}`);

                    // --- Integration of Translation Step ---
                    // Fetch the newly upserted article to ensure we have its ID and all fields for translation
                    const savedArticle = await prisma.articleList.findUnique({
                        where: { slug: article.slug },
                    });

                    if (savedArticle) {
                        // Create the "en" version in ArticleTranslation
                        try {
                            console.log(`📝 [BlogSync] Creating 'en' ArticleTranslation for ${savedArticle.id}`);
                            await prisma.articleTranslation.upsert({
                                where: { articleId_language: { articleId: savedArticle.id, language: "en" } },
                                update: {
                                    headline: savedArticle.headline,
                                    metaDescription: savedArticle.metaDescription,
                                    metaKeywords: savedArticle.metaKeywords,
                                    html: savedArticle.html,
                                    markdown: savedArticle.markdown,
                                    outline: savedArticle.outline,
                                    published: savedArticle.published,
                                    publishedAt: savedArticle.publishedAt,
                                    image: savedArticle.image,
                                    myImageUrl: savedArticle.myImageUrl,
                                    tags: savedArticle.tags,
                                    category: savedArticle.category,
                                    readingTime: savedArticle.readingTime,
                                    blog: savedArticle.blog,
                                    relatedPosts: savedArticle.relatedPosts,
                                    slug: savedArticle.slug, // Assuming slug remains the same for 'en'
                                    status: "translated", // Changed from ORIGINAL_CONTENT
                                    updatedAt: new Date(),
                                },
                                create: {
                                    articleId: savedArticle.id,
                                    language: "en",
                                    headline: savedArticle.headline,
                                    metaDescription: savedArticle.metaDescription,
                                    metaKeywords: savedArticle.metaKeywords,
                                    html: savedArticle.html,
                                    markdown: savedArticle.markdown,
                                    outline: savedArticle.outline,
                                    published: savedArticle.published,
                                    publishedAt: savedArticle.publishedAt,
                                    image: savedArticle.image,
                                    myImageUrl: savedArticle.myImageUrl,
                                    tags: savedArticle.tags,
                                    category: savedArticle.category,
                                    readingTime: savedArticle.readingTime,
                                    blog: savedArticle.blog,
                                    relatedPosts: savedArticle.relatedPosts,
                                    slug: savedArticle.slug, // Assuming slug remains the same for 'en'
                                    status: "translated", // Changed from ORIGINAL_CONTENT
                                },
                            });
                            console.log(`✅ [BlogSync] Successfully created/updated 'en' ArticleTranslation for ${savedArticle.id}`);
                        } catch (translationError) {
                            console.error(`❌ [BlogSync] Error creating/updating 'en' ArticleTranslation for ${savedArticle.id}:`, translationError);
                            // Decide if this error should prevent further translations or be logged and ignored
                        }

                        console.log(`🔵 [BlogSync] Starting translations for article ${savedArticle.id} (${savedArticle.headline})...`);
                        await translateArticleToAllLanguages(savedArticle);
                        console.log(`🟢 [BlogSync] Finished all translations for article ${savedArticle.id}.`);
                    } else {
                        console.warn(`🟡 [BlogSync] Could not fetch article ${article.slug} immediately after upsert for translation. Skipping translations for this article.`);
                    }
                    // --- End of Translation Step ---

                    break; // Exit retry loop on successful upsert and translation attempt
                } catch (error) {
                    upsertRetries--;
                    if (upsertRetries === 0) {
                        throw error;
                    }
                    console.log(`⚠️ Database upsert failed, retrying... (${upsertRetries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                }
            }

            console.log(`✅ Article processed successfully: ${article.slug}`);
            results.push({ slug: article.slug, success: true });
        } catch (error) {
            console.error(`❌ Error processing article ${article?.slug || 'unknown'}:`, error);
            results.push({ slug: article.slug, success: false, error: error.message });
        }
    }

    const successfulUpdates = results.filter(r => r.success).length;
    console.log(`📊 Batch summary: ${successfulUpdates}/${results.length} articles processed successfully`);

    return {
        success: true,
        processed: true,
        results,
        totalProcessed: results.length,
        successfulUpdates
    };
}

async function handleSync(req) {
    // --- TEMPORARY DEBUG LOG REMOVED ---
    // console.log("[DEBUG handleSync] DATABASE_URL:", process.env.DATABASE_URL);
    // --- END TEMPORARY DEBUG LOG REMOVED ---
    console.log('🚀 Starting blog sync...');

    // Removed BATCH_SIZE constant
    const FORCE_SYNC = blogConfig.blog.forceSync; // Use value from config

    // Validate environment variables
    if (!process.env.SEOBOT_API_KEY) {
        console.error('❌ SEOBOT_API_KEY is not set');
        return NextResponse.json({
            success: false,
            error: 'SEOBOT_API_KEY environment variable is not set'
        }, { status: 500 });
    }

    try {
        // Initialize BlogClient with WebSocket disabled
        const client = new BlogClient(process.env.SEOBOT_API_KEY, {
            apiUrl: 'https://app.seobotai.com/api',
            useWebSocket: false // Disable WebSocket to avoid buffer issues
        });

        // Get existing articles first for comparison
        let existingArticles = [];
        try {
            existingArticles = await prisma.articleList.findMany({
                select: {
                    slug: true,
                    updatedAt: true,
                    image: true,
                    myImageUrl: true,
                    html: true,
                    outline: true,
                    markdown: true,
                    relatedPosts: true // Add relatedPosts to selected fields
                }
            });
            console.log(`📚 Found ${existingArticles.length} existing articles`);
        } catch (error) {
            console.error('❌ Error fetching existing articles:', error);
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch existing articles'
            }, { status: 500 });
        }

        // Get total count of articles to sync
        let totalArticles = 0;
        try {
            // Fetch total count - using limit 1 is efficient
            const initialResponse = await client.getArticles(0, 1);
            totalArticles = initialResponse.total || 0;
            if (totalArticles === 0) {
                console.log('📚 Source API reports 0 articles. Nothing to sync.');
                return NextResponse.json({ success: true, completed: true, message: 'No articles found in source.' });
            }
            console.log(`📚 Found total of ${totalArticles} articles to sync`);
        } catch (error) {
            console.error('❌ Error getting total articles count:', error);
            // Log detailed error for total count failure
            console.error('  Count Error details:', error.message, error.stack);
            return NextResponse.json({
                success: false,
                error: 'Failed to get total articles count'
            }, { status: 500 });
        }

        // Fetch ALL articles at once
        console.log(`🚚 Fetching all ${totalArticles} articles...`);
        let allArticlesResponse;
        try {
            // Fetch all articles using the determined total count
            allArticlesResponse = await client.getArticles(0, totalArticles);
            if (!allArticlesResponse?.articles?.length) {
                // This case might indicate an issue if totalArticles > 0
                console.warn('⚠️ Fetched 0 articles despite expecting', totalArticles);
                // Proceed cautiously, maybe log an error or return
                return NextResponse.json({
                    success: false, // Indicate potential issue
                    completed: true,
                    error: 'Fetched 0 articles unexpectedly.',
                    message: 'Sync attempted, but no articles were returned from source despite initial count.'
                }, { status: 500 }); // Use 500 to signal potential API inconsistency
            }
            console.log(`✅ Successfully fetched ${allArticlesResponse.articles.length} articles.`);
        } catch (error) {
            console.error('❌ Error fetching all articles:', error);
            console.error('  Fetch All Error details:', error.message, error.stack);
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch all articles from source'
            }, { status: 500 });
        }

        // Process the entire batch of fetched articles
        const result = await processArticleBatch(allArticlesResponse.articles, client, existingArticles, FORCE_SYNC);

        // Removed the self-triggering fetch logic for next batch

        // Revalidate if needed (only if articles were actually processed)
        if (result.processed && !result.skipped) {
            // console.log('✅ Cache revalidated and sitemap updated on main site'); // Keep this log if you only remove the fetch calls
            // The following block for revalidation and sitemap update has been removed.
        }

        console.log('✅ Sync process completed.');

        return NextResponse.json({
            success: true,
            completed: true, // Mark as completed since we process all at once
            totalArticles,
            processedCount: result.totalProcessed,
            successfulCount: result.successfulUpdates,
            message: `Sync complete. Processed ${result.totalProcessed} articles.`
            // Removed nextBatchAt
            // Spread result details cautiously, avoid overriding completed/success flags
            // ...result
        });
    } catch (error) {
        console.error("❌ Sync Error:", error);
        return NextResponse.json({
            success: false,
            error: error?.message || 'Unknown error occurred'
        }, { status: 500 });
    }
}

// Initialize sync
export async function GET(req) {
    return handleSync(req);
}

// Continue sync process
export async function POST(req) {
    return handleSync(req);
}

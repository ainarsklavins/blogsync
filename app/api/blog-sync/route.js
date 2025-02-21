import { prisma } from "@/lib/prisma";
import { BlogClient } from "seobot";
import { bucket } from "@/lib/GCS";
import { NextResponse } from "next/server";
import { baseUrl } from "@/config/config";

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
            let myImageUrl = existing?.myImageUrl;
            if (article.image && (!existing || article.image !== existing.image)) {
                try {
                    const fileName = `blog/${article.slug}-${Date.now()}.jpg`;
                    myImageUrl = await downloadAndUploadImage(article.image, fileName);
                } catch (error) {
                    console.error(`❌ Failed to process image: ${error.message}`);
                    myImageUrl = article.image; // Fallback to original image URL
                }
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
                myImageUrl: myImageUrl || article.image || null,
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
                    break;
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
    console.log('🚀 Starting blog sync...');

    // Fixed configuration
    const BATCH_SIZE = 5; // Process 5 articles at a time
    const FORCE_SYNC = true; // Always force sync all articles

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
            const initialResponse = await client.getArticles(0, 1);
            totalArticles = initialResponse.total || 0;
            console.log(`📚 Found total of ${totalArticles} articles to sync`);
        } catch (error) {
            console.error('❌ Error getting total articles count:', error);
            return NextResponse.json({
                success: false,
                error: 'Failed to get total articles count'
            }, { status: 500 });
        }

        // Calculate current offset from URL or start from 0
        const { searchParams } = new URL(req.url);
        const currentOffset = parseInt(searchParams.get('offset') || '0', 10);
        console.log(`📝 Processing batch starting at offset ${currentOffset}`);

        // Fetch and process current batch
        let response;
        try {
            response = await client.getArticles(currentOffset, BATCH_SIZE);
            if (!response?.articles?.length) {
                console.log('✅ All articles processed');
                return NextResponse.json({
                    success: true,
                    completed: true,
                    message: 'All articles have been processed'
                });
            }
        } catch (error) {
            console.error('❌ Error fetching articles:', error);
            return NextResponse.json({
                success: false,
                error: 'Failed to fetch articles'
            }, { status: 500 });
        }

        const result = await processArticleBatch(response.articles, client, existingArticles, FORCE_SYNC);

        if (result.processed) {
            // Get request headers for origin
            const origin = req.headers.get('origin') || '';
            const host = req.headers.get('host') || '';
            const protocol = origin.startsWith('https') ? 'https' : 'http';

            // Calculate next offset
            const nextOffset = currentOffset + BATCH_SIZE;

            // Only trigger next batch if there are more articles to process
            if (nextOffset < totalArticles) {
                // Trigger next batch asynchronously
                try {
                    await fetch(`${protocol}://${host}/api/blog-sync?offset=${nextOffset}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    console.log(`🔄 Triggered next batch starting at offset ${nextOffset}`);
                } catch (error) {
                    console.error('⚠️ Failed to trigger next batch:', error);
                }
            } else {
                console.log('✅ Reached end of articles, no more batches to process');
            }

            // Revalidate if needed
            if (!result.skipped) {
                try {
                    // Use MAIN_SITE_DOMAIN for sitemap and revalidation
                    const mainSiteDomain = process.env.MAIN_SITE_DOMAIN?.replace(/\/$/, '') || 'https://booktranslator.ai';
                    console.log(`🌐 Using main site domain: ${mainSiteDomain}`);

                    await Promise.all([
                        fetch(`${mainSiteDomain}/api/revalidate?path=/blog`, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.SEOBOT_API_KEY}` // Add auth if needed
                            }
                        }).then(res => {
                            if (!res.ok) throw new Error(`Revalidation failed: ${res.status}`);
                            return res;
                        }),
                        fetch(`${mainSiteDomain}/api/update-sitemap`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.SEOBOT_API_KEY}` // Add auth if needed
                            }
                        }).then(res => {
                            if (!res.ok) throw new Error(`Sitemap update failed: ${res.status}`);
                            return res;
                        })
                    ]);
                    console.log('✅ Cache revalidated and sitemap updated on main site');
                } catch (error) {
                    console.error('⚠️ Failed to revalidate or update sitemap:', error);
                    console.error('  Error details:', error.message);
                }
            }
        }

        return NextResponse.json({
            success: true,
            currentOffset,
            totalArticles,
            nextBatchAt: currentOffset + BATCH_SIZE,
            ...result
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

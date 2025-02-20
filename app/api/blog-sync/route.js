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

        // Download image with shorter timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        const response = await fetch(imageUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error('Failed to fetch image');
        const buffer = await response.arrayBuffer();

        // Upload to GCS
        await file.save(Buffer.from(buffer), {
            contentType: response.headers.get('content-type'),
        });

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

    // Process only one article at a time to stay within time limits
    const article = articlesToProcess[0];
    try {
        if (!article.slug) {
            throw new Error('Article missing required slug');
        }

        const existing = existingArticles.find(e => e.slug === article.slug);
        console.log(`📝 Processing article: ${article.slug}`);

        // Handle image - only if needed
        let myImageUrl = existing?.myImageUrl;
        if (article.image && (!existing || article.image !== existing.image)) {
            const fileName = `blog/${article.slug}-${Date.now()}.jpg`;
            myImageUrl = await downloadAndUploadImage(article.image, fileName);
        }

        // Get full article content only if needed
        let fullArticle = null;
        if (!existing || new Date(article.updatedAt) > new Date(existing.updatedAt)) {
            console.log(`🔍 Fetching full content for: ${article.slug}`);
            try {
                fullArticle = await client.getArticle(article.slug);
            } catch (error) {
                console.error(`❌ Error fetching full article: ${error.message}`);
                // Continue with existing content if available
                fullArticle = {
                    html: existing?.html || '',
                    outline: existing?.outline || '',
                    markdown: existing?.markdown || ''
                };
            }
        }

        // Prepare article data
        const articleData = {
            headline: article.headline || 'Untitled',
            metaDescription: article.metaDescription,
            metaKeywords: article.keywords
                ? Array.isArray(article.keywords)
                    ? article.keywords.join(', ')
                    : article.keywords
                : article.tags
                    ? Array.isArray(article.tags)
                        ? article.tags.map(tag => tag.title || tag).join(', ')
                        : article.tags
                    : null,
            published: true,
            publishedAt: new Date(article.publishedAt || article.createdAt || Date.now()),
            updatedAt: new Date(article.updatedAt || Date.now()),
            image: article.image,
            myImageUrl: myImageUrl || article.image,
            tags: article.tags || [],
            category: article.category || {},
            readingTime: article.readingTime || 0,
            blog: article.blog || {},
            relatedPosts: article.relatedPosts || [],
            html: fullArticle?.html || existing?.html || '',
            outline: fullArticle?.outline || existing?.outline || '',
            markdown: fullArticle?.markdown || existing?.markdown || ''
        };

        // Upsert article
        await prisma.articleList.upsert({
            where: { slug: article.slug },
            update: articleData,
            create: {
                slug: article.slug,
                ...articleData
            }
        });

        console.log(`✅ Article processed successfully: ${article.slug}`);
        return { success: true, processed: true, currentOffset: articles.length };
    } catch (error) {
        console.error(`❌ Error processing article ${article?.slug || 'unknown'}:`, error);
        return { success: false, error: error.message };
    }
}

async function handleSync(req) {
    console.log('🚀 Starting blog sync...');

    // Validate environment variables
    if (!process.env.SEOBOT_API_KEY) {
        console.error('❌ SEOBOT_API_KEY is not set');
        return NextResponse.json({
            success: false,
            error: 'SEOBOT_API_KEY environment variable is not set'
        }, { status: 500 });
    }

    try {
        // Get parameters from query params
        const { searchParams } = new URL(req.url);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const forceSync = searchParams.get('force') === 'true';
        const BATCH_SIZE = 1; // Process only one article at a time

        console.log(`📚 Processing batch at offset ${offset}${forceSync ? ' (Force sync enabled)' : ''}`);

        // Get existing articles first for comparison
        const existingArticles = await prisma.articleList.findMany({
            select: {
                slug: true,
                updatedAt: true,
                image: true,
                myImageUrl: true,
                html: true,
                outline: true,
                markdown: true
            }
        });

        const client = new BlogClient(process.env.SEOBOT_API_KEY, {
            apiUrl: 'https://app.seobotai.com/api'
        });

        // Get total count if this is the first batch
        let totalArticles = 0;
        if (offset === 0) {
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
        }

        // Fetch and process current batch
        const response = await client.getArticles(offset, BATCH_SIZE);
        if (!response.articles?.length) {
            console.log('✅ All articles processed');
            return NextResponse.json({
                success: true,
                completed: true,
                message: 'All articles have been processed'
            });
        }

        const result = await processArticleBatch(response.articles, client, existingArticles, forceSync);

        if (result.processed) {
            // Trigger next batch processing
            const nextOffset = offset + BATCH_SIZE;
            const nextBatchUrl = new URL('/api/blog-sync', baseUrl);
            nextBatchUrl.searchParams.set('offset', nextOffset.toString());

            // Trigger next batch asynchronously
            fetch(nextBatchUrl, { method: 'POST' })
                .catch(error => console.error('Failed to trigger next batch:', error));

            // Revalidate if needed
            if (!result.skipped) {
                try {
                    await Promise.all([
                        fetch(new URL('/api/revalidate?path=/blog', baseUrl)),
                        fetch(new URL('/api/update-sitemap', baseUrl), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        })
                    ]);
                    console.log('✅ Cache revalidated and sitemap updated');
                } catch (error) {
                    console.error('⚠️ Failed to revalidate or update sitemap:', error);
                }
            }
        }

        return NextResponse.json({
            success: true,
            offset,
            totalArticles,
            ...result
        });
    } catch (error) {
        console.error("❌ Sync Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message
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

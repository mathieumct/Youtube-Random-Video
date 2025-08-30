// popup.js - YouTube Random Video Extension - Version Simple et Efficace
document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const randomBtn = document.getElementById('randomBtn');
    const status = document.getElementById('status');
    const videoCount = document.getElementById('videoCount');
    const lastUsed = document.getElementById('lastUsed');
    const supportBtn = document.getElementById('supportBtn');

    console.log('Extension popup loaded!');
    console.log('Random button:', randomBtn);
    console.log('Support button:', supportBtn);

    // Load saved stats when popup opens
    await loadStats();

    // Main button click handler
    if (randomBtn) {
        randomBtn.addEventListener('click', async () => {
            console.log('Random button clicked!');
            try {
                await getRandomVideo();
            } catch (error) {
                console.error('Error getting random video:', error);
                showStatus('error', `Error: ${error.message}`);
            }
        });
    }

    // Support button
    if (supportBtn) {
        supportBtn.addEventListener('click', () => {
            console.log('Support button clicked!');
            const supportUrl = 'https://www.buymeacoffee.com/caps';
            chrome.tabs.create({ url: supportUrl });
        });
    }

    async function getRandomVideo() {
        showStatus('loading', '🔍 Looking for videos...');
        randomBtn.disabled = true;

        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            // Force fresh YouTube homepage with cache busting
            showStatus('loading', '📺 Loading fresh YouTube...');
            const timestamp = Date.now();
            const randomParam = Math.random().toString(36).substring(7);
            await chrome.tabs.update(tab.id, { 
                url: `https://www.youtube.com/?t=${timestamp}&r=${randomParam}` 
            });
            
            // Wait longer for page to fully load
            await sleep(4000);

            // Try multiple attempts to find videos
            showStatus('loading', '🎬 Finding videos...');
            
            let videos = [];
            let attempts = 0;
            const maxAttempts = 3;
            
            while (videos.length === 0 && attempts < maxAttempts) {
                attempts++;
                showStatus('loading', `🎬 Searching videos... (${attempts}/${maxAttempts})`);
                
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: scrapeYouTubeHomePage,
                    });

                    videos = results[0].result || [];
                    
                    if (videos.length === 0 && attempts < maxAttempts) {
                        console.log(`Attempt ${attempts}: No videos found, refreshing page...`);
                        // Force refresh the page
                        await chrome.tabs.reload(tab.id);
                        await sleep(3000);
                    }
                } catch (scriptError) {
                    console.error(`Script error on attempt ${attempts}:`, scriptError);
                    if (attempts < maxAttempts) {
                        await sleep(2000);
                    }
                }
            }

            console.log('Videos found:', videos);

            if (!videos || videos.length === 0) {
                throw new Error('No videos found after multiple attempts. Try refreshing YouTube manually and try again!');
            }

            // Simple anti-repetition system
            const recentVideos = await getRecentVideos();
            let availableVideos = videos.filter(video => 
                !recentVideos.some(recent => recent.url === video.url)
            );
            
            // If all videos were recently watched, use all videos
            const videosToChooseFrom = availableVideos.length > 0 ? availableVideos : videos;
            
            // Pick random video
            const randomVideo = videosToChooseFrom[Math.floor(Math.random() * videosToChooseFrom.length)];
            
            // Save to recent list
            await saveRecentVideo(randomVideo);

            showStatus('loading', `🎬 Opening: ${randomVideo.title.substring(0, 30)}...`);

            // Navigate to the video
            await chrome.tabs.update(tab.id, { url: randomVideo.url });

            // Update stats
            await updateStats(videos.length);

            showStatus('success', `✅ Enjoy your random video!`);

            // Close popup
            setTimeout(() => window.close(), 1500);

        } catch (error) {
            console.error('Error in getRandomVideo:', error);
            showStatus('error', `❌ ${error.message}`);
        } finally {
            randomBtn.disabled = false;
        }
    }

    // This function runs INSIDE the YouTube page
    function scrapeYouTubeHomePage() {
        console.log('🔍 Starting YouTube scrape...');
        
        const videos = [];
        
        // Enhanced selectors with more YouTube variations
        const selectors = [
            'ytd-rich-item-renderer a#video-title-link',
            'ytd-video-renderer a#video-title',
            'ytd-compact-video-renderer a#video-title',
            'ytd-rich-grid-media a#video-title-link',
            'a[href*="/watch?v="]',
            'a#thumbnail[href*="/watch?v="]',
            '.ytd-rich-item-renderer a[href*="/watch?v="]',
            '.ytd-video-renderer a[href*="/watch?v="]'
        ];
        
        // First, wait a bit for content to load
        const contentLoaded = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length > 0;
        console.log('Content containers found:', contentLoaded);
        
        for (const selector of selectors) {
            try {
                const videoElements = document.querySelectorAll(selector);
                console.log(`Selector "${selector}" found ${videoElements.length} elements`);
                
                if (videoElements.length > 0) {
                    videoElements.forEach((element, index) => {
                        if (videos.length >= 40) return; // Increased limit
                        
                        try {
                            // Multiple ways to get title
                            const title = element.getAttribute('title') || 
                                         element.getAttribute('aria-label') ||
                                         element.textContent?.trim() ||
                                         element.querySelector('yt-formatted-string')?.textContent?.trim() ||
                                         'YouTube Video';
                            
                            const url = element.href;
                            
                            if (title && url && url.includes('/watch?v=') && title.length > 3) {
                                // Clean URL more thoroughly
                                const cleanUrl = url.split('&')[0].split('#')[0].split('?')[0] + '?' + 
                                               url.split('?')[1]?.split('&')[0];
                                
                                // Avoid duplicates and invalid URLs
                                if (!videos.some(v => v.url === cleanUrl) && cleanUrl.includes('watch?v=')) {
                                    videos.push({
                                        title: title.substring(0, 80),
                                        url: cleanUrl,
                                        timestamp: Date.now(),
                                        selector: selector
                                    });
                                }
                            }
                        } catch (e) {
                            console.log(`Error processing element ${index}:`, e);
                        }
                    });
                    
                    // Continue searching with other selectors too
                    if (videos.length >= 20) {
                        console.log(`✅ Found enough videos with selector: ${selector}`);
                        break;
                    }
                }
            } catch (selectorError) {
                console.log(`Error with selector ${selector}:`, selectorError);
            }
        }
        
        console.log(`✨ Found ${videos.length} videos total`);
        return videos;
    }

    // Helper functions
    function showStatus(type, message) {
        if (status) {
            status.className = `status ${type}`;
            status.textContent = message;
            status.style.display = 'block';
        }
        console.log(`Status: ${type} - ${message}`);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function loadStats() {
        try {
            const data = await chrome.storage.local.get(['videoCount', 'lastUsed']);
            if (videoCount) videoCount.textContent = data.videoCount || 0;
            if (lastUsed) {
                lastUsed.textContent = data.lastUsed ? 
                    new Date(data.lastUsed).toLocaleDateString() : 'Never';
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async function updateStats(foundVideosCount) {
        try {
            const totalVideos = parseInt(videoCount?.textContent || 0) + 1;
            const now = Date.now();

            await chrome.storage.local.set({
                videoCount: totalVideos,
                lastUsed: now
            });

            if (videoCount) videoCount.textContent = totalVideos;
            if (lastUsed) lastUsed.textContent = new Date(now).toLocaleDateString();
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    async function getRecentVideos() {
        try {
            const data = await chrome.storage.local.get(['recentVideos']);
            const recentVideos = data.recentVideos || [];
            
            // Reduce time window to 15 minutes instead of 30 to allow more variety
            const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
            
            return recentVideos
                .filter(video => video && video.timestamp > fifteenMinutesAgo)
                .slice(0, 8); // Reduced from 10 to 8
        } catch (error) {
            console.error('Error getting recent videos:', error);
            return [];
        }
    }

    async function saveRecentVideo(video) {
        try {
            if (!video || !video.url) return;
            
            const recentVideos = await getRecentVideos();
            
            recentVideos.unshift({
                url: video.url,
                title: video.title.substring(0, 50),
                timestamp: Date.now()
            });
            
            // Keep only last 15 videos
            const limitedRecent = recentVideos.slice(0, 15);
            
            await chrome.storage.local.set({ recentVideos: limitedRecent });
        } catch (error) {
            console.error('Error saving recent video:', error);
        }
    }
});

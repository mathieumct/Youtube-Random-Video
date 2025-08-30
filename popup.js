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
            
            // Navigate to YouTube homepage
            showStatus('loading', '📺 Loading YouTube...');
            await chrome.tabs.update(tab.id, { url: 'https://www.youtube.com' });
            
            // Wait for page to load
            await sleep(3000);

            // Inject and execute the scraping script
            showStatus('loading', '🎬 Finding videos...');
            
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: scrapeYouTubeHomePage,
            });

            const videos = results[0].result;
            console.log('Videos found:', videos);

            if (!videos || videos.length === 0) {
                throw new Error('No videos found. Please try again!');
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
        
        // Main selectors for YouTube video links
        const selectors = [
            'ytd-rich-item-renderer a#video-title-link',
            'ytd-video-renderer a#video-title',
            'a[href*="/watch?v="]'
        ];
        
        for (const selector of selectors) {
            const videoElements = document.querySelectorAll(selector);
            console.log(`Selector "${selector}" found ${videoElements.length} elements`);
            
            if (videoElements.length > 0) {
                videoElements.forEach((element, index) => {
                    if (videos.length >= 30) return; // Limit to 30 videos
                    
                    try {
                        const title = element.getAttribute('title') || 
                                     element.getAttribute('aria-label') ||
                                     element.textContent?.trim() ||
                                     'YouTube Video';
                        
                        const url = element.href;
                        
                        if (title && url && url.includes('/watch?v=') && title.length > 3) {
                            // Clean URL
                            const cleanUrl = url.split('&')[0].split('#')[0];
                            
                            // Avoid duplicates
                            if (!videos.some(v => v.url === cleanUrl)) {
                                videos.push({
                                    title: title.substring(0, 80),
                                    url: cleanUrl,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    } catch (e) {
                        console.log(`Error processing element ${index}:`, e);
                    }
                });
                
                // Stop after finding videos
                if (videos.length > 0) {
                    console.log(`✅ Success with selector: ${selector}`);
                    break;
                }
            }
        }
        
        console.log(`✨ Found ${videos.length} videos`);
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
            
            // Keep videos from last 30 minutes
            const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
            
            return recentVideos
                .filter(video => video && video.timestamp > thirtyMinutesAgo)
                .slice(0, 10);
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

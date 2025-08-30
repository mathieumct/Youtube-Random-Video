// popup.js - Version clean et sécurisée
document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const randomBtn = document.getElementById('randomBtn');
    const status = document.getElementById('status');
    const videoCount = document.getElementById('videoCount');
    const lastUsed = document.getElementById('lastUsed');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const saveSettings = document.getElementById('saveSettings');
    const cancelSettings = document.getElementById('cancelSettings');

    // Security & Validation Functions
    function isValidYouTubeUrl(url) {
        try {
            if (!url || typeof url !== 'string') return false;
            
            const parsedUrl = new URL(url);
            const validDomains = ['www.youtube.com', 'youtube.com', 'm.youtube.com'];
            
            if (!validDomains.includes(parsedUrl.hostname)) return false;
            if (parsedUrl.protocol !== 'https:') return false;
            if (!parsedUrl.pathname.startsWith('/watch')) return false;
            
            const videoId = parsedUrl.searchParams.get('v');
            return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
        } catch (error) {
            console.error('URL validation error:', error);
            return false;
        }
    }

    function cleanYouTubeUrl(rawUrl) {
        try {
            const urlObj = new URL(rawUrl);
            const videoId = urlObj.searchParams.get('v');
            
            if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                console.warn('Invalid video ID in URL:', rawUrl);
                return rawUrl;
            }
            
            const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
            
            if (rawUrl !== cleanUrl) {
                console.log(`URL cleaned: removed timestamp parameters`);
            }
            
            return cleanUrl;
        } catch (error) {
            console.error('Error cleaning URL:', error);
            return rawUrl;
        }
    }

    function sanitizeVideoData(rawVideo) {
        if (!rawVideo || typeof rawVideo !== 'object') return null;
        
        return {
            title: (rawVideo.title || 'Unknown')
                .replace(/[<>\"'&]/g, '')
                .substring(0, 200)
                .trim(),
            url: isValidYouTubeUrl(rawVideo.url) ? rawVideo.url : null,
            duration: typeof rawVideo.duration === 'string' ? 
                      rawVideo.duration.replace(/[^0-9:]/g, '').substring(0, 10) : null,
            isLive: Boolean(rawVideo.isLive),
            timestamp: Date.now()
        };
    }

    async function logSecurityEvent(event, details) {
        try {
            const logEntry = {
                event,
                details,
                timestamp: Date.now(),
                version: '1.0.1'
            };
            
            const data = await chrome.storage.local.get(['securityLogs']);
            const logs = data.securityLogs || [];
            logs.push(logEntry);
            
            await chrome.storage.local.set({
                securityLogs: logs.slice(-50)
            });
        } catch (error) {
            console.error('Error logging security event:', error);
        }
    }

    // YouTube Scraping Function (injected into YouTube page)
    function scrapeYouTubeHomePageSecure() {
        console.log('Starting secure YouTube scrape...');
        
        const videos = [];
        const MAX_VIDEOS = 50;
        
        // URL cleaning function (runs in YouTube context)
        function cleanYouTubeUrl(rawUrl) {
            try {
                const urlObj = new URL(rawUrl);
                const videoId = urlObj.searchParams.get('v');
                if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                    return rawUrl;
                }
                return `https://www.youtube.com/watch?v=${videoId}`;
            } catch (error) {
                return rawUrl;
            }
        }
        
        function getDurationFromElement(element) {
            try {
                const videoContainer = element.closest('ytd-rich-item-renderer, ytd-video-renderer');
                if (!videoContainer) return null;
                
                const durationElement = videoContainer.querySelector(
                    'span.ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer'
                );
                
                const durationText = durationElement?.textContent?.trim();
                
                console.log('Found duration text:', durationText);
                
                if (durationText && /^(\d+:)?(\d{1,2}:)?\d{1,2}$|^LIVE$|^EN DIRECT$/.test(durationText)) {
                    return durationText;
                }
                
                return null;
            } catch {
                return null;
            }
        }

        function checkIfLiveStream(element) {
            try {
                const videoContainer = element.closest('ytd-rich-item-renderer, ytd-video-renderer');
                if (!videoContainer) return false;
                
                const durationElement = videoContainer.querySelector(
                    'span.ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer'
                );
                const durationText = durationElement?.textContent?.trim();
                
                const isLiveByDuration = durationText && (
                    durationText === 'LIVE' || 
                    durationText === 'EN DIRECT' || 
                    durationText === 'DIRECT' ||
                    durationText === 'LIVE NOW'
                );
                
                const liveIndicators = videoContainer.querySelectorAll(
                    '[aria-label*="live"], [aria-label*="LIVE"], .live-now, .badge-live, .badge-style-type-live-now'
                );
                
                return isLiveByDuration || liveIndicators.length > 0;
            } catch {
                return false;
            }
        }
        
        try {
            const selectors = [
                'ytd-rich-item-renderer #video-title-link',
                'ytd-video-renderer #video-title',
                '#contents ytd-rich-item-renderer a#video-title-link',
                'a[href*="/watch?v="]'
            ];
            
            for (const selector of selectors) {
                const videoElements = document.querySelectorAll(selector);
                console.log(`Selector "${selector}" found ${videoElements.length} elements`);
                
                if (videoElements.length > 0) {
                    let processedCount = 0;
                    
                    videoElements.forEach((element, index) => {
                        if (processedCount >= MAX_VIDEOS) return;
                        
                        try {
                            const rawTitle = element.getAttribute('title') || 
                                           element.getAttribute('aria-label') ||
                                           element.textContent?.trim();
                            
                            const rawUrl = element.href;
                            
                            if (!rawTitle || !rawUrl) return;
                            if (rawTitle.length > 200) return;
                            if (!rawUrl.includes('/watch?v=')) return;
                            
                            // Validate URL format
                            try {
                                const testUrl = new URL(rawUrl);
                                if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(testUrl.hostname)) {
                                    return;
                                }
                                const videoId = testUrl.searchParams.get('v');
                                if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                                    return;
                                }
                            } catch {
                                return;
                            }
                            
                            videos.push({
                                title: rawTitle.replace(/[<>\"'&]/g, '').substring(0, 200),
                                url: cleanYouTubeUrl(rawUrl), // Clean timestamps here
                                duration: getDurationFromElement(element),
                                isLive: checkIfLiveStream(element),
                                timestamp: Date.now()
                            });
                            
                            processedCount++;
                            
                        } catch (error) {
                            console.warn(`Error processing element ${index}:`, error.message);
                        }
                    });
                    
                    if (videos.length > 0) break;
                }
            }
            
        } catch (error) {
            console.error('Critical error in scraping:', error);
            return [];
        }
        
        console.log(`Secure scraping complete: ${videos.length} validated videos`);
        return videos;
    }

    // Main Random Video Function
    async function getRandomVideoSecure() {
        const MAX_RETRIES = 3;
        let retryCount = 0;
        
        while (retryCount < MAX_RETRIES) {
            try {
                showStatus('loading', 'Securely looking for videos...');
                randomBtn.disabled = true;
                
                await logSecurityEvent('random_video_attempt', {
                    attempt: retryCount + 1,
                    maxRetries: MAX_RETRIES
                });

                const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
                
                if (!tab || !tab.url) {
                    throw new Error('Invalid tab detected');
                }
                
                // Navigate to YouTube if necessary
                if (!tab.url.includes('youtube.com')) {
                    showStatus('loading', 'Navigating to YouTube...');
                    await chrome.tabs.update(tab.id, { 
                        url: 'https://www.youtube.com'
                    });
                    await sleep(3000);
                }

                // Scrape videos
                showStatus('loading', 'Analyzing videos with filters...');
                
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: scrapeYouTubeHomePageSecure,
                });

                const rawVideos = results[0]?.result || [];
                
                if (rawVideos.length === 0) {
                    if (retryCount < MAX_RETRIES - 1) {
                        retryCount++;
                        console.log(`No videos found, retrying... (${retryCount}/${MAX_RETRIES})`);
                        await sleep(2000);
                        continue;
                    } else {
                        throw new Error('No videos found after multiple attempts');
                    }
                }

                // Validate scraped videos
                const validVideos = rawVideos.filter(video => {
                    const sanitized = sanitizeVideoData(video);
                    return sanitized && sanitized.url && isValidYouTubeUrl(sanitized.url);
                });
                
                if (validVideos.length === 0) {
                    throw new Error('No valid video URLs found');
                }

                console.log(`Security validation: ${validVideos.length}/${rawVideos.length} videos approved`);

                // Apply user filters
                const filteredVideos = await applyFilters(validVideos);
                
                if (filteredVideos.length === 0) {
                    throw new Error('No videos match your filters');
                }

                // Smart video selection (avoid recent)
                const videosToChooseFrom = await selectVideosPool(filteredVideos);

                if (videosToChooseFrom.length === 0) {
                    throw new Error('No videos available for selection');
                }

                // Select random video
                const selectedVideo = videosToChooseFrom[Math.floor(Math.random() * videosToChooseFrom.length)];
                
                if (!isValidYouTubeUrl(selectedVideo.url)) {
                    throw new Error('Selected video URL failed final security check');
                }
                
                showStatus('loading', `Opening: ${selectedVideo.title.substring(0, 30)}...`);
                
                await logSecurityEvent('video_selected', {
                    title: selectedVideo.title.substring(0, 50),
                    hasValidUrl: isValidYouTubeUrl(selectedVideo.url),
                    filtersApplied: true
                });
                
                // Navigate to clean URL
                const finalUrl = cleanYouTubeUrl(selectedVideo.url);
                await chrome.tabs.update(tab.id, { url: finalUrl });
                
                // Update stats and save
                await saveRecentVideoSecure(selectedVideo);
                await updateStats(filteredVideos.length);
                
                showStatus('success', 'Perfect video found!');
                setTimeout(() => window.close(), 1500);
                
                break;
                
            } catch (error) {
                console.error(`Security error (attempt ${retryCount + 1}):`, error);
                
                await logSecurityEvent('security_error', {
                    attempt: retryCount + 1,
                    error: error.message,
                    stack: error.stack?.substring(0, 200)
                });
                
                if (retryCount < MAX_RETRIES - 1) {
                    retryCount++;
                    showStatus('loading', `Retrying... (${retryCount}/${MAX_RETRIES})`);
                    await sleep(1000);
                } else {
                    showStatus('error', `Error: ${error.message}`);
                    break;
                }
            } finally {
                randomBtn.disabled = false;
            }
        }
    }

    // Video Selection Logic
    async function selectVideosPool(filteredVideos) {
        const recentVideos = await getRecentVideos();
        let availableVideos = filteredVideos.filter(video => 
            !recentVideos.some(recent => recent.url === video.url)
        );

        if (availableVideos.length >= 2) {
            console.log(`Using ${availableVideos.length} fresh videos`);
            return availableVideos;
        } else {
            // Avoid only the very last video
            const lastVideo = recentVideos[0];
            const videosExceptLast = filteredVideos.filter(video => 
                !lastVideo || video.url !== lastVideo.url
            );
            console.log(`Using all videos except the very last one`);
            return videosExceptLast.length > 0 ? videosExceptLast : filteredVideos;
        }
    }

    // Filter Application
    async function applyFilters(videos) {
        try {
            const settings = await chrome.storage.local.get([
                'filterShorts', 'minDuration', 'maxDuration', 
                'filterLiveStreams', 'filterRecentlyWatched', 'filterLowViews'
            ]);
            
            console.log('Applying filters with settings:', settings);
            console.log('Total videos before filtering:', videos.length);
            
            let filteredVideos = [...videos];
            let filterSteps = [];
            
            // Filter live streams
            if (settings.filterLiveStreams) {
                const beforeCount = filteredVideos.length;
                filteredVideos = filteredVideos.filter(video => !video.isLive);
                const afterCount = filteredVideos.length;
                filterSteps.push(`Live streams: ${beforeCount} → ${afterCount} (removed ${beforeCount - afterCount})`);
            }
            
            // Filter by duration
            if (settings.filterShorts || settings.minDuration || settings.maxDuration) {
                const beforeCount = filteredVideos.length;
                
                filteredVideos = filteredVideos.filter(video => {
                    // Skip live videos (already filtered above)
                    if (video.isLive) return false;
                    
                    // If no duration info, keep the video
                    if (!video.duration) {
                        console.log('Video has no duration, keeping:', video.title.substring(0, 30));
                        return true;
                    }
                    
                    const durationInMinutes = parseDuration(video.duration);
                    if (durationInMinutes === null) {
                        console.log('Could not parse duration, keeping:', video.duration, video.title.substring(0, 30));
                        return true;
                    }
                    
                    console.log(`Video "${video.title.substring(0, 30)}" duration: ${durationInMinutes} minutes`);
                    
                    // Filter shorts (< 1 minute)
                    if (settings.filterShorts && durationInMinutes < 1) {
                        console.log('Filtering out short video:', video.title.substring(0, 30));
                        return false;
                    }
                    
                    // Filter by minimum duration
                    if (settings.minDuration && durationInMinutes < settings.minDuration) {
                        console.log(`Filtering out video too short (${durationInMinutes} < ${settings.minDuration}):`, video.title.substring(0, 30));
                        return false;
                    }
                    
                    // Filter by maximum duration
                    if (settings.maxDuration && durationInMinutes > settings.maxDuration) {
                        console.log(`Filtering out video too long (${durationInMinutes} > ${settings.maxDuration}):`, video.title.substring(0, 30));
                        return false;
                    }
                    
                    return true;
                });
                
                const afterCount = filteredVideos.length;
                filterSteps.push(`Duration filters: ${beforeCount} → ${afterCount} (removed ${beforeCount - afterCount})`);
            }
            
            console.log('Filter steps:', filterSteps);
            console.log(`Final result: ${filteredVideos.length}/${videos.length} videos approved`);
            
            return filteredVideos;
        } catch (error) {
            console.error('Error applying filters:', error);
            return videos;
        }
    }

    function parseDuration(durationString) {
        if (!durationString || typeof durationString !== 'string') return null;
        
        const cleanDuration = durationString.replace(/[^0-9:]/g, '');
        const parts = cleanDuration.split(':').map(part => parseInt(part, 10));
        
        if (parts.some(isNaN) || parts.length === 0) return null;
        
        let minutes = 0;
        if (parts.length === 2) {
            minutes = Math.max(0, parts[0]) + Math.max(0, parts[1]) / 60;
        } else if (parts.length === 3) {
            minutes = Math.max(0, parts[0]) * 60 + Math.max(0, parts[1]) + Math.max(0, parts[2]) / 60;
        } else {
            return null;
        }
        
        return Math.min(minutes, 1000);
    }

    // Storage Functions
    async function getRecentVideos() {
        try {
            const data = await chrome.storage.local.get(['recentVideos']);
            const recentVideos = data.recentVideos || [];
            
            // 15 minutes cooldown instead of 1 hour
            const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
            
            const validRecent = recentVideos
                .filter(video => video && video.timestamp > fifteenMinutesAgo && isValidYouTubeUrl(video.url))
                .slice(0, 10);
                
            console.log(`Anti-repeat: avoiding ${validRecent.length} recent videos`);
            return validRecent;
        } catch (error) {
            console.error('Error getting recent videos:', error);
            return [];
        }
    }

    async function saveRecentVideoSecure(video) {
        try {
            if (!video || !video.url || !isValidYouTubeUrl(video.url)) {
                console.warn('Attempted to save invalid video, skipping');
                await logSecurityEvent('invalid_save_attempt', {
                    hasVideo: !!video,
                    hasUrl: !!video?.url,
                    isValidUrl: video?.url ? isValidYouTubeUrl(video.url) : false
                });
                return;
            }
            
            const recentVideos = await getRecentVideos();
            
            const secureVideoData = {
                url: video.url,
                title: (video.title || 'Unknown').substring(0, 100),
                timestamp: Date.now()
            };
            
            recentVideos.unshift(secureVideoData);
            const limitedRecent = recentVideos.slice(0, 20);
            
            await chrome.storage.local.set({ recentVideos: limitedRecent });
            
        } catch (error) {
            console.error('Error in secure video save:', error);
            await logSecurityEvent('save_error', { error: error.message });
        }
    }

    // Settings Functions
    async function loadSettings() {
        try {
            const settings = await chrome.storage.local.get([
                'filterShorts', 'minDuration', 'maxDuration', 
                'filterLiveStreams', 'filterRecentlyWatched', 'filterLowViews'
            ]);
            
            console.log('Loading settings:', settings);
            
            const elements = {
                filterShorts: document.getElementById('filterShorts'),
                minDuration: document.getElementById('minDuration'),
                maxDuration: document.getElementById('maxDuration'),
                filterLiveStreams: document.getElementById('filterLiveStreams'),
                filterRecentlyWatched: document.getElementById('filterRecentlyWatched'),
                filterLowViews: document.getElementById('filterLowViews')
            };
            
            // Debug: check if elements exist
            Object.keys(elements).forEach(key => {
                if (!elements[key]) {
                    console.error(`Element not found: ${key}`);
                } else {
                    console.log(`Element found: ${key}`);
                }
            });
            
            if (elements.filterShorts) elements.filterShorts.checked = settings.filterShorts || false;
            if (elements.minDuration) elements.minDuration.value = settings.minDuration || '';
            if (elements.maxDuration) elements.maxDuration.value = settings.maxDuration || '';
            if (elements.filterLiveStreams) elements.filterLiveStreams.checked = settings.filterLiveStreams || false;
            if (elements.filterRecentlyWatched) elements.filterRecentlyWatched.checked = settings.filterRecentlyWatched || false;
            if (elements.filterLowViews) elements.filterLowViews.checked = settings.filterLowViews || false;
            
            console.log('Settings loaded successfully');
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async function saveSettingsData() {
        try {
            const elements = {
                filterShorts: document.getElementById('filterShorts'),
                minDuration: document.getElementById('minDuration'),
                maxDuration: document.getElementById('maxDuration'),
                filterLiveStreams: document.getElementById('filterLiveStreams'),
                filterRecentlyWatched: document.getElementById('filterRecentlyWatched'),
                filterLowViews: document.getElementById('filterLowViews')
            };
            
            const settings = {
                filterShorts: elements.filterShorts?.checked || false,
                minDuration: parseInt(elements.minDuration?.value) || null,
                maxDuration: parseInt(elements.maxDuration?.value) || null,
                filterLiveStreams: elements.filterLiveStreams?.checked || false,
                filterRecentlyWatched: elements.filterRecentlyWatched?.checked || false,
                filterLowViews: elements.filterLowViews?.checked || false
            };
            
            // Validation: min can't be > max
            if (settings.minDuration && settings.maxDuration && settings.minDuration > settings.maxDuration) {
                settings.minDuration = settings.maxDuration;
                if (elements.minDuration) elements.minDuration.value = settings.minDuration;
            }
            
            console.log('Saving settings:', settings);
            await chrome.storage.local.set(settings);
            await logSecurityEvent('settings_saved', { settingsKeys: Object.keys(settings) });
            
            console.log('Settings saved successfully');
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    // UI Helper Functions
    function showStatus(type, message) {
        if (!status) return;
        
        const cleanMessage = String(message).substring(0, 200);
        
        status.className = `status ${type}`;
        status.textContent = cleanMessage;
        status.style.display = 'block';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.min(ms, 10000)));
    }

    async function loadStats() {
        try {
            const data = await chrome.storage.local.get(['videoCount', 'lastUsed']);
            if (videoCount) videoCount.textContent = Math.max(0, parseInt(data.videoCount) || 0);
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
            const currentCount = Math.max(0, parseInt(videoCount?.textContent) || 0);
            const totalVideos = currentCount + 1;
            const now = Date.now();

            await chrome.storage.local.set({
                videoCount: totalVideos,
                lastUsed: now,
                lastFoundCount: Math.max(0, foundVideosCount || 0)
            });

            if (videoCount) videoCount.textContent = totalVideos;
            if (lastUsed) lastUsed.textContent = new Date(now).toLocaleDateString();
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    // Event Listeners Setup
    async function initializeExtension() {
        try {
            await loadStats();
            await loadSettings();
            
            // Main button
            if (randomBtn) {
                randomBtn.addEventListener('click', getRandomVideoSecure);
            }

            // Settings panel
            if (settingsBtn && settingsPanel) {
                settingsBtn.addEventListener('click', () => {
                    const isHidden = settingsPanel.style.display === 'none' || !settingsPanel.style.display;
                    settingsPanel.style.display = isHidden ? 'block' : 'none';
                    settingsBtn.textContent = isHidden ? 'Hide Filters' : 'Filters';
                });
            }

            // Save settings
            if (saveSettings) {
                saveSettings.addEventListener('click', async () => {
                    await saveSettingsData();
                    if (settingsPanel) settingsPanel.style.display = 'none';
                    if (settingsBtn) settingsBtn.textContent = 'Filters';
                    showStatus('success', 'Settings saved!');
                    setTimeout(() => {
                        if (status) status.style.display = 'none';
                    }, 2000);
                });
            }

            // Cancel settings
            if (cancelSettings) {
                cancelSettings.addEventListener('click', () => {
                    loadSettings();
                    if (settingsPanel) settingsPanel.style.display = 'none';
                    if (settingsBtn) settingsBtn.textContent = 'Filters';
                });
            }
            
            await logSecurityEvent('popup_initialized', { version: '1.0.1' });
            
        } catch (error) {
            console.error('Critical initialization error:', error);
            await logSecurityEvent('initialization_error', { error: error.message });
        }
    }

    // Initialize the extension
    await initializeExtension();
});
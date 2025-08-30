// popup.js - Interface logic
document.addEventListener('DOMContentLoaded', async () => {
    const randomBtn = document.getElementById('randomBtn');
    const status = document.getElementById('status');
  const videoCount = document.getElementById('videoCount');
  const lastUsed = document.getElementById('lastUsed');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const saveSettings = document.getElementById('saveSettings');
  const cancelSettings = document.getElementById('cancelSettings');

  // Load saved stats when popup opens
  await loadStats();
  await loadSettings();    // Main button click handler
  randomBtn.addEventListener('click', async () => {
    try {
      await getRandomVideo();
    } catch (error) {
      console.error('Error getting random video:', error);
      showStatus('error', `Error: ${error.message}`);
    }
  });

  // Settings panel toggle
  settingsBtn.addEventListener('click', () => {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? 'block' : 'none';
    settingsBtn.textContent = isHidden ? '⚙️ Hide Filters' : '⚙️ Filters';
  });

  // Save settings
  saveSettings.addEventListener('click', async () => {
    await saveSettingsData();
    settingsPanel.style.display = 'none';
    settingsBtn.textContent = '⚙️ Filters';
    showStatus('success', '✅ Settings saved!');
  });

  // Cancel settings
  cancelSettings.addEventListener('click', () => {
    loadSettings(); // Reset to saved values
    settingsPanel.style.display = 'none';
    settingsBtn.textContent = '⚙️ Filters';
  });    async function getRandomVideo() {
        showStatus('loading', '🔍 Looking for videos...');
        randomBtn.disabled = true;

        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Always go to YouTube homepage to get fresh videos
            showStatus('loading', '📺 Loading fresh videos from YouTube...');
            await chrome.tabs.update(tab.id, { url: 'https://www.youtube.com' });
            
            // Wait for page to load
            await sleep(3000);

            // Inject and execute the scraping script
            showStatus('loading', '🎬 Finding videos on page...');

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: scrapeYouTubeHomePage,
            });

            const videos = results[0].result;

            if (!videos || videos.length === 0) {
                throw new Error('No videos found on this page. Try going to YouTube homepage first!');
            }

            // Apply filters to videos
            const filteredVideos = await applyFilters(videos);
            
            if (filteredVideos.length === 0) {
                throw new Error('No videos match your filters. Try adjusting your settings!');
            }

            // Avoid recently selected videos
            const recentVideos = await getRecentVideos();
            const availableVideos = filteredVideos.filter(video => 
                !recentVideos.some(recent => recent.url === video.url)
            );
            
            // If all videos were recently watched, use all filtered videos
            const videosToChooseFrom = availableVideos.length > 0 ? availableVideos : filteredVideos;
            
            // Pick random video from available videos
            const randomVideo = videosToChooseFrom[Math.floor(Math.random() * videosToChooseFrom.length)];
            
            // Save this video to recent list
            await saveRecentVideo(randomVideo);

            showStatus('loading', `🎬 Opening: ${randomVideo.title.substring(0, 30)}...`);

            // Navigate to the video
            await chrome.tabs.update(tab.id, { url: randomVideo.url });

            // Update stats
            await updateStats(filteredVideos.length);

            showStatus('success', `✅ Enjoy your random video!`);

            // Close popup after success
            setTimeout(() => window.close(), 1500);

        } catch (error) {
            throw error;
        } finally {
            randomBtn.disabled = false;
        }
    }

  // This function runs INSIDE the YouTube page
  function scrapeYouTubeHomePage() {
    console.log('🔍 Starting to scrape YouTube page...');
    
    const videos = [];
    
    // Different selectors for different YouTube layouts
    const selectors = [
      'ytd-rich-item-renderer #video-title-link',     // Main homepage
      'ytd-video-renderer #video-title',              // Search/subscriptions page
      '#contents ytd-rich-item-renderer a#video-title-link', // Alternative layout
      'a[href*="/watch?v="]'                          // Fallback: any video link
    ];
    
    for (const selector of selectors) {
      console.log(`Trying selector: ${selector}`);
      const videoElements = document.querySelectorAll(selector);
      console.log(`Found ${videoElements.length} elements`);
      
      if (videoElements.length > 0) {
        videoElements.forEach((element, index) => {
          try {
            const title = element.getAttribute('title') || 
                         element.getAttribute('aria-label') ||
                         element.textContent?.trim() ||
                         'Unknown video';
            
            const url = element.href;
            
            // Try to get video duration from nearby elements
            let duration = null;
            let isLive = false;
            const videoContainer = element.closest('ytd-rich-item-renderer, ytd-video-renderer');
            if (videoContainer) {
              const durationElement = videoContainer.querySelector('span.ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer');
              if (durationElement) {
                const durationText = durationElement.textContent?.trim();
                duration = durationText;
                
                // Check if it's a live stream
                isLive = durationText === 'LIVE' || 
                        durationText === 'EN DIRECT' || 
                        durationText === 'DIRECT' ||
                        durationText === 'LIVE NOW' ||
                        videoContainer.querySelector('.badge-style-type-live-now, .ytd-thumbnail-overlay-toggle-button-renderer[aria-label*="live"], .ytd-thumbnail-overlay-toggle-button-renderer[aria-label*="LIVE"]') !== null;
              }
              
              // Additional check for live indicators
              if (!isLive) {
                const liveIndicators = videoContainer.querySelectorAll('[aria-label*="live"], [aria-label*="LIVE"], .live-now, .badge-live');
                isLive = liveIndicators.length > 0;
              }
            }
            
            if (title && url && url.includes('/watch?v=') && title !== 'Unknown video') {
              videos.push({
                title: title,
                url: url,
                duration: duration,
                isLive: isLive,
                timestamp: Date.now()
              });
            }
          } catch (e) {
            console.log(`Error parsing element ${index}:`, e);
          }
        });
        
        // Stop after finding videos with first working selector
        if (videos.length > 0) {
          console.log(`Success with selector: ${selector}`);
          break;
        }
      }
    }
    
    console.log(`Total videos found: ${videos.length}`);
    console.log('Sample videos:', videos.slice(0, 3));
    
    return videos.slice(0, 50); // Limit to 50 videos for performance
  }    // Helper functions
    function showStatus(type, message) {
        status.className = `status ${type}`;
        status.textContent = message;
        status.style.display = 'block';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function loadStats() {
        const data = await chrome.storage.local.get(['videoCount', 'lastUsed']);
        videoCount.textContent = data.videoCount || 0;
        lastUsed.textContent = data.lastUsed ?
            new Date(data.lastUsed).toLocaleDateString() : 'Never';
    }

    async function updateStats(foundVideosCount) {
        const totalVideos = parseInt(videoCount.textContent) + 1;
        const now = Date.now();

        await chrome.storage.local.set({
            videoCount: totalVideos,
            lastUsed: now,
            lastFoundCount: foundVideosCount
        });

        videoCount.textContent = totalVideos;
        lastUsed.textContent = new Date(now).toLocaleDateString();
    }

    // Filter application function
    async function applyFilters(videos) {
        const settings = await chrome.storage.local.get(['filterShorts', 'minDuration', 'maxDuration', 'filterLiveStreams', 'filterRecentlyWatched', 'filterLowViews']);
        
        let filteredVideos = [...videos];
        
        // Filter live streams
        if (settings.filterLiveStreams) {
            filteredVideos = filteredVideos.filter(video => !video.isLive);
        }
        
        // Filter by duration
        if (settings.filterShorts || settings.minDuration || settings.maxDuration) {
            filteredVideos = filteredVideos.filter(video => {
                if (!video.duration || video.isLive) return !video.isLive; // Skip live videos, keep others without duration info
                
                const durationInMinutes = parseDuration(video.duration);
                if (durationInMinutes === null) return true; // Keep if we can't parse duration
                
                // Filter shorts (< 1 minute)
                if (settings.filterShorts && durationInMinutes < 1) {
                    return false;
                }
                
                // Filter by minimum duration
                if (settings.minDuration && durationInMinutes < settings.minDuration) {
                    return false;
                }
                
                // Filter by maximum duration
                if (settings.maxDuration && durationInMinutes > settings.maxDuration) {
                    return false;
                }
                
                return true;
            });
        }
        
        console.log(`Filtered videos: ${filteredVideos.length} out of ${videos.length}`);
        return filteredVideos;
    }

    // Parse YouTube duration format (e.g., "10:30", "1:20:45", "0:45")
    function parseDuration(durationString) {
        if (!durationString) return null;
        
        const parts = durationString.split(':').map(part => parseInt(part, 10));
        if (parts.some(isNaN)) return null;
        
        let minutes = 0;
        if (parts.length === 2) {
            // Format: MM:SS
            minutes = parts[0] + parts[1] / 60;
        } else if (parts.length === 3) {
            // Format: HH:MM:SS
            minutes = parts[0] * 60 + parts[1] + parts[2] / 60;
        } else {
            return null;
        }
        
        return minutes;
    }

    // Load settings from storage
    async function loadSettings() {
        const settings = await chrome.storage.local.get([
            'filterShorts', 
            'minDuration', 
            'maxDuration', 
            'filterLiveStreams',
            'filterRecentlyWatched', 
            'filterLowViews'
        ]);
        
        document.getElementById('filterShorts').checked = settings.filterShorts || false;
        document.getElementById('minDuration').value = settings.minDuration || '';
        document.getElementById('maxDuration').value = settings.maxDuration || '';
        document.getElementById('filterLiveStreams').checked = settings.filterLiveStreams || false;
        document.getElementById('filterRecentlyWatched').checked = settings.filterRecentlyWatched || false;
        document.getElementById('filterLowViews').checked = settings.filterLowViews || false;
    }

    // Save settings to storage
    async function saveSettingsData() {
        const settings = {
            filterShorts: document.getElementById('filterShorts').checked,
            minDuration: parseInt(document.getElementById('minDuration').value) || null,
            maxDuration: parseInt(document.getElementById('maxDuration').value) || null,
            filterLiveStreams: document.getElementById('filterLiveStreams').checked,
            filterRecentlyWatched: document.getElementById('filterRecentlyWatched').checked,
            filterLowViews: document.getElementById('filterLowViews').checked
        };
        
        await chrome.storage.local.set(settings);
    }

    // Get recently watched videos to avoid repeats
    async function getRecentVideos() {
        const data = await chrome.storage.local.get(['recentVideos']);
        const recentVideos = data.recentVideos || [];
        
        // Remove videos older than 1 hour to keep the list fresh
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        return recentVideos.filter(video => video.timestamp > oneHourAgo);
    }

    // Save a video to the recent list
    async function saveRecentVideo(video) {
        const recentVideos = await getRecentVideos();
        
        // Add current video to the beginning of the list
        recentVideos.unshift({
            url: video.url,
            title: video.title,
            timestamp: Date.now()
        });
        
        // Keep only the last 20 videos to avoid too much storage
        const limitedRecent = recentVideos.slice(0, 20);
        
        await chrome.storage.local.set({ recentVideos: limitedRecent });
    }
});
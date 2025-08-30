// content.js - Version sécurisée
(function() {
    'use strict';
    
    // Vérification que nous sommes bien sur YouTube
    if (!window.location.hostname.match(/^(www\.)?youtube\.com$/)) {
        console.warn('🚨 YouTube Random: Unexpected domain, script stopped');
        return;
    }
    
    console.log('🔒 YouTube Random extension loaded securely on:', window.location.href);

    // Rate limiting pour éviter le spam
    let lastShortcutTime = 0;
    const SHORTCUT_COOLDOWN = 2000; // 2 secondes entre les shortcuts

    // Add keyboard shortcut: Ctrl+Shift+R for random video
    document.addEventListener('keydown', (event) => {
        // Rate limiting
        const now = Date.now();
        if (now - lastShortcutTime < SHORTCUT_COOLDOWN) {
            return;
        }
        
        if (event.ctrlKey && event.shiftKey && event.key === 'R') {
            event.preventDefault();
            lastShortcutTime = now;
            
            console.log('🔒 Secure keyboard shortcut triggered!');
            showSecureNotification('Press the extension button to get a random video!');
        }
    });

    // Fonction de notification sécurisée
    function showSecureNotification(message) {
        try {
            // Sanitiser le message
            const cleanMessage = String(message)
                .replace(/[<>\"'&]/g, '')
                .substring(0, 200);
            
            // Vérifier si une notification existe déjà
            const existingNotification = document.querySelector('.youtube-random-notification');
            if (existingNotification) {
                existingNotification.remove();
            }
            
            // Créer la notification avec des styles sécurisés
            const notification = document.createElement('div');
            notification.className = 'youtube-random-notification';
            
            // Utiliser cssText pour éviter l'injection de style
            notification.style.cssText = [
                'position: fixed',
                'top: 20px',
                'right: 20px',
                'background: #ff0000',
                'color: white',
                'padding: 12px 20px',
                'border-radius: 8px',
                'font-family: Arial, sans-serif',
                'font-size: 14px',
                'z-index: 10000',
                'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
                'max-width: 300px',
                'word-wrap: break-word'
            ].join('; ');
            
            // Utiliser textContent pour éviter l'injection HTML
            notification.textContent = cleanMessage;

            // Vérifier que document.body existe
            if (document.body) {
                document.body.appendChild(notification);
                
                // Auto-remove avec cleanup sécurisé
                const timeoutId = setTimeout(() => {
                    try {
                        if (notification && notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    } catch (error) {
                        console.warn('🚨 Error removing notification:', error);
                    }
                }, 3000);
                
                // Cleanup en cas d'erreur
                notification.addEventListener('error', () => {
                    clearTimeout(timeoutId);
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                });
            }
            
        } catch (error) {
            console.error('🚨 Error creating secure notification:', error);
        }
    }

    // Surveillance sécurisée des changements de page YouTube (SPA)
    let currentUrl = location.href;
    let urlChangeTimeout = null;

    // Observer avec throttling pour éviter la surcharge
    const secureObserver = new MutationObserver(() => {
        // Debounce les changements d'URL
        if (urlChangeTimeout) {
            clearTimeout(urlChangeTimeout);
        }
        
        urlChangeTimeout = setTimeout(() => {
            if (location.href !== currentUrl) {
                // Validation de l'URL avant de logger
                try {
                    const newUrl = new URL(location.href);
                    if (newUrl.hostname.match(/^(www\.)?youtube\.com$/)) {
                        currentUrl = location.href;
                        console.log('🔒 YouTube page changed securely to:', currentUrl.substring(0, 100));
                    }
                } catch (error) {
                    console.warn('🚨 Invalid URL detected:', error);
                }
            }
        }, 100); // Debounce de 100ms
    });

    // Démarrer l'observation avec des options sécurisées
    if (document.body) {
        secureObserver.observe(document, {
            subtree: true, 
            childList: true,
            // Limiter aux changements nécessaires pour éviter la surcharge
            attributes: false,
            characterData: false
        });
    }

    // Message handler sécurisé pour la communication avec popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            // Valider que le message vient bien de notre extension
            if (!sender.id || sender.id !== chrome.runtime.id) {
                console.warn('🚨 Message from unknown sender:', sender);
                return;
            }
            
            // Valider le format du message
            if (!message || typeof message !== 'object' || !message.action) {
                console.warn('🚨 Invalid message format:', message);
                return;
            }
            
            // Handler sécurisé pour les actions
            switch (message.action) {
                case 'triggerRandom':
                    // Rate limiting
                    const now = Date.now();
                    if (now - lastShortcutTime < SHORTCUT_COOLDOWN) {
                        sendResponse({
                            success: false,
                            error: 'Rate limited - please wait before trying again'
                        });
                        return;
                    }
                    lastShortcutTime = now;
                    
                    showSecureNotification('🎲 Random video triggered from shortcut!');
                    sendResponse({ success: true });
                    break;
                    
                case 'getPageInfo':
                    // Retourner des infos sécurisées sur la page courante
                    try {
                        const pageInfo = {
                            url: window.location.href.substring(0, 200), // Limiter la longueur
                            title: document.title.substring(0, 100),
                            isYouTube: window.location.hostname.match(/^(www\.)?youtube\.com$/) !== null,
                            timestamp: Date.now()
                        };
                        sendResponse({ success: true, data: pageInfo });
                    } catch (error) {
                        sendResponse({ success: false, error: 'Error getting page info' });
                    }
                    break;
                    
                default:
                    console.warn('🚨 Unknown action requested:', message.action);
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('🚨 Error handling message:', error);
            sendResponse({ success: false, error: 'Internal error' });
        }
        
        // Retourner true pour indiquer une réponse asynchrone
        return true;
    });

    // Cleanup sécurisé quand la page se ferme
    window.addEventListener('beforeunload', () => {
        try {
            // Nettoyer les timeouts
            if (urlChangeTimeout) {
                clearTimeout(urlChangeTimeout);
            }
            
            // Déconnecter l'observer
            if (secureObserver) {
                secureObserver.disconnect();
            }
            
            // Supprimer les notifications restantes
            const notifications = document.querySelectorAll('.youtube-random-notification');
            notifications.forEach(notification => {
                try {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                } catch (error) {
                    console.warn('🚨 Error cleaning up notification:', error);
                }
            });
            
            console.log('🔒 YouTube Random content script cleaned up securely');
        } catch (error) {
            console.error('🚨 Error during cleanup:', error);
        }
    });

    // Auto-cleanup après 1 heure pour éviter les fuites mémoire
    setTimeout(() => {
        try {
            if (secureObserver) {
                secureObserver.disconnect();
            }
            console.log('🔒 YouTube Random content script auto-cleanup after 1 hour');
        } catch (error) {
            console.error('🚨 Error in auto-cleanup:', error);
        }
    }, 60 * 60 * 1000); // 1 heure

    // Performance monitoring (optionnel)
    if (typeof performance !== 'undefined' && performance.mark) {
        try {
            performance.mark('youtube-random-content-loaded');
        } catch (error) {
            // Ignore les erreurs de performance API
        }
    }

    console.log('🔒✅ YouTube Random content script initialized securely');
})();
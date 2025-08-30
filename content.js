// content.js - Runs on every YouTube page
console.log('🎲 YouTube Random extension loaded on:', window.location.href);

// Add keyboard shortcut: Ctrl+Shift+R for random video
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'R') {
        event.preventDefault();
        console.log('🎲 Keyboard shortcut triggered!');

        // You could trigger the random video logic here
        // For now, we'll just show a message
        showNotification('Press the extension button to get a random video!');
    }
});

// Simple notification function
function showNotification(message) {
    // Create a simple notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff0000;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Log when page changes (YouTube is a SPA)
let currentUrl = location.href;
new MutationObserver(() => {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        console.log('🎲 YouTube page changed to:', currentUrl);
    }
}).observe(document, { subtree: true, childList: true });
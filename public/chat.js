const socket = io();
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const loadingElement = document.getElementById('loading');

socket.on('response', (response) => {
    hideLoading();
    if (typeof response === 'object') {
        switch (response.type) {
            case 'event_confirmation':
            case 'event_deletion':
                addEventCard(response);
                break;
            case 'event_suggestion':
                addEventSuggestion(response);
                break;
            default:
                addMessage('Bot', response.message || JSON.stringify(response));
        }
    } else {
        addMessage('Bot', response);
    }
});

function sendMessage() {
    const message = messageInput.value;
    if (message) {
        addMessage('You', message);
        socket.emit('message', message);
        messageInput.value = '';
        showLoading();
    }
}

function addMessage(sender, text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === 'You' ? 'user-message' : 'bot-message');
    messageElement.textContent = `${sender}: ${text}`;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addEventSuggestion(eventData) {
    const suggestionElement = document.createElement('div');
    suggestionElement.classList.add('event-suggestion');
    
    suggestionElement.innerHTML = `
        <h4>Event Suggestion</h4>
        <p>${eventData.message}</p>
        <div class="event-details">
            <p><strong>${eventData.event.summary}</strong></p>
            <p>📅 ${formatDate(eventData.event.start)} - ${formatDate(eventData.event.end)}</p>
            ${eventData.event.location ? `<p>📍 ${eventData.event.location}</p>` : ''}
        </div>
        <div class="suggestion-buttons">
            <button class="accept-btn">Accept</button>
            <button class="deny-btn">Deny</button>
        </div>
    `;
    
    chatBox.appendChild(suggestionElement);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Add event listeners to buttons
    suggestionElement.querySelector('.accept-btn').addEventListener('click', () => {
        socket.emit('message', 'Accept event');
        showLoading();
    });
    suggestionElement.querySelector('.deny-btn').addEventListener('click', () => {
        socket.emit('message', 'Deny event');
        showLoading();
    });
}

function addEventCard(eventData) {
    const cardElement = document.createElement('div');
    cardElement.classList.add('event-card');

    let cardContent = `
        <h4>${eventData.type === 'event_confirmation' ? 'Event Confirmed' : 'Event Deleted'}</h4>
        <p>${eventData.message}</p>
    `;

    if (eventData.event) {
        cardContent += `
            <div class="event-details">
                <p><strong>${eventData.event.summary}</strong></p>
                ${eventData.event.start ? `<p>📅 ${formatDate(eventData.event.start)} - ${formatDate(eventData.event.end)}</p>` : ''}
                ${eventData.event.location ? `<p>📍 ${eventData.event.location}</p>` : ''}
            </div>
        `;
    }

    if (eventData.link) {
        cardContent += `
            <a href="${eventData.link}" target="_blank" rel="noopener noreferrer" class="button">View in Calendar</a>
        `;
    }

    cardElement.innerHTML = cardContent;
    chatBox.appendChild(cardElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading() {
    loadingElement.classList.remove('hidden');
    chatBox.scrollTop = chatBox.scrollHeight;
}

function hideLoading() {
    loadingElement.classList.add('hidden');
}

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

document.querySelectorAll('.example').forEach(example => {
    example.addEventListener('click', () => {
        messageInput.value = example.textContent.replace(' →', '');
        sendMessage();
    });
});

// Initialize the chat with a welcome message
addMessage('Bot', 'Hello! How can I assist you with your calendar today?');

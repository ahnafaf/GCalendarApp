const socket = io();
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');

socket.on('response', (response) => {
    chatBox.innerHTML += `<p><strong>Bot:</strong> ${response}</p>`;
    chatBox.scrollTop = chatBox.scrollHeight;
});

function sendMessage() {
    const message = messageInput.value;
    if (message) {
        socket.emit('message', message);
        chatBox.innerHTML += `<p><strong>You:</strong> ${message}</p>`;
        messageInput.value = '';
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

class ChatbotApp {
    constructor() {
        this.apiBaseUrl = 'http://127.0.0.1:5000';
        this.currentUser = null;
        this.chatHistories = {};
        this.activeChatId = null;
        this.isSpeechEnabled = false;
        this.recognition = null;
        this.isListening = false;
        this.init();
    }

    init() {
        this.checkLoginState();
        this.setupEventListeners();
        this.setupSpeechRecognition();
    }

    checkLoginState() {
        const user = sessionStorage.getItem('currentUser');
        if (user) {
            this.currentUser = JSON.parse(user);
            this.loadChatHistories();
            if (this.currentUser.role === 'student') {
                this.showPage('chat-page');
                this.renderChatHistoryList();
                if (!this.activeChatId || Object.keys(this.chatHistories).length === 0) {
                   this.startNewChat();
                } else {
                   this.switchChat(this.activeChatId);
                }
            } else {
                this.showPage('upload-page');
                this.updateFacultyInfo();
                this.populateDivisionSelector();
            }
        } else {
            this.showPage('login-page');
        }
    }

    setupEventListeners() {
        // Login
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));

        // Student Chat
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('user-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        document.getElementById('new-chat-btn').addEventListener('click', () => this.startNewChat());
        document.getElementById('student-logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('mic-btn').addEventListener('click', () => this.toggleListening());
        document.getElementById('speaker-toggle-btn').addEventListener('click', () => this.toggleSpeechOutput());

        // Faculty Admin Navigation & Actions
        document.querySelectorAll('[id*="goto-upload-btn"]').forEach(btn => btn.addEventListener('click', () => this.showPage('upload-page')));
        document.querySelectorAll('[id*="goto-manage-btn"]').forEach(btn => btn.addEventListener('click', () => this.showPage('manage-page')));
        document.querySelectorAll('[id*="goto-analytics-btn"]').forEach(btn => btn.addEventListener('click', () => this.showPage('analytics-page')));
        document.querySelectorAll('[id*="goto-users-btn"]').forEach(btn => btn.addEventListener('click', () => this.showPage('users-page')));
        
        // Logout buttons
        document.querySelectorAll('[id*="faculty-logout-btn"]').forEach(btn => btn.addEventListener('click', () => this.logout()));

        // Upload Page Listeners
        const uploadDropzone = document.getElementById('upload-dropzone');
        const fileInput = document.getElementById('file-input');
        if (uploadDropzone) uploadDropzone.addEventListener('click', () => fileInput.click());
        if (fileInput) fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
        document.getElementById('process-upload').addEventListener('click', () => this.processUpload());
        if (uploadDropzone) {
            uploadDropzone.addEventListener('dragover', (e) => { e.preventDefault(); uploadDropzone.classList.add('dragover'); });
            uploadDropzone.addEventListener('dragleave', () => uploadDropzone.classList.remove('dragover'));
            uploadDropzone.addEventListener('drop', (e) => { e.preventDefault(); uploadDropzone.classList.remove('dragover'); this.handleFileSelect(e.dataTransfer.files); });
        }
        
        document.getElementById('clear-analytics-btn').addEventListener('click', () => this.clearAnalyticsData());
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegisterUser(e));
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const role = document.getElementById('role-selector').value;
        const errorMsg = document.getElementById('login-error-msg');

        if (!username || !password) {
            errorMsg.textContent = 'Username and Password cannot be empty.';
            errorMsg.classList.remove('hidden');
            return;
        }

        this.showLoading();
        try {
            const response = await fetch(`${this.apiBaseUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            this.currentUser = result.user;
            sessionStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            this.checkLoginState();
        } catch (error) {
            errorMsg.textContent = error.message;
            errorMsg.classList.remove('hidden');
        } finally {
            this.hideLoading();
        }
    }

    logout() {
        this.currentUser = null;
        sessionStorage.removeItem('currentUser');
        this.chatHistories = {};
        this.activeChatId = null;
        this.showPage('login-page');
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
        document.getElementById(pageId).classList.remove('hidden');

        document.querySelectorAll('.admin-nav-link').forEach(link => link.classList.remove('active'));
        if (pageId.includes('upload')) document.querySelectorAll('[id*="goto-upload-btn"]').forEach(b => b.classList.add('active'));
        if (pageId.includes('manage')) document.querySelectorAll('[id*="goto-manage-btn"]').forEach(b => b.classList.add('active'));
        if (pageId.includes('analytics')) document.querySelectorAll('[id*="goto-analytics-btn"]').forEach(b => b.classList.add('active'));
        if (pageId.includes('users')) document.querySelectorAll('[id*="goto-users-btn"]').forEach(b => b.classList.add('active'));

        if (pageId === 'manage-page') this.renderManageableDocuments();
        if (pageId === 'analytics-page') this.renderAnalyticsDashboard();
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.lang = 'en-US';
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;

            this.recognition.onresult = (event) => {
                const speechResult = event.results[0][0].transcript;
                document.getElementById('user-input').value = speechResult;
                this.sendMessage();
            };
            this.recognition.onspeechend = () => {
                this.recognition.stop();
                this.isListening = false;
                document.getElementById('mic-btn').classList.remove('listening');
            };
            this.recognition.onerror = (event) => {
                this.isListening = false;
                document.getElementById('mic-btn').classList.remove('listening');
                this.showToast(`Voice Error: ${event.error}`, 'error');
            };
        } else {
            document.getElementById('mic-btn').style.display = 'none';
            console.warn("Speech Recognition not supported in this browser.");
        }
    }

    toggleListening() {
        if (!this.recognition) return;
        if (this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            document.getElementById('mic-btn').classList.remove('listening');
        } else {
            this.recognition.start();
            this.isListening = true;
            document.getElementById('mic-btn').classList.add('listening');
        }
    }

    toggleSpeechOutput() {
        this.isSpeechEnabled = !this.isSpeechEnabled;
        const btn = document.getElementById('speaker-toggle-btn');
        if (this.isSpeechEnabled) {
            btn.innerHTML = `<i class="fas fa-volume-up"></i>`;
            btn.classList.add('active');
            this.showToast('Voice responses enabled.', 'info');
        } else {
            btn.innerHTML = `<i class="fas fa-volume-off"></i>`;
            btn.classList.remove('active');
            speechSynthesis.cancel();
            this.showToast('Voice responses disabled.', 'info');
        }
    }

    speak(text) {
        if (!this.isSpeechEnabled || !text) return;
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
    }
    
    startNewChat() {
        this.activeChatId = `chat_${Date.now()}`;
        this.chatHistories[this.activeChatId] = [];
        this.renderChat();
        this.renderChatHistoryList();
        this.addWelcomeMessage();
    }

    switchChat(chatId) {
        this.activeChatId = chatId;
        this.renderChat();
        this.renderChatHistoryList();
    }

    async sendMessage() {
        const input = document.getElementById('user-input');
        const messageText = input.value.trim();
        if (!messageText || !this.activeChatId) return;
    
        const historyForRequest = [...(this.chatHistories[this.activeChatId] || [])];
    
        this.addMessage('user', messageText);
        input.value = '';
        this.showTypingIndicator();
    
        try {
            const response = await fetch(`${this.apiBaseUrl}/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: messageText, 
                    division: this.currentUser.division,
                    history: historyForRequest
                }),
            });
    
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred.' }));
                throw new Error(errorData.message);
            }
    
            const result = await response.json();
            this.removeTypingIndicator();
            this.addMessage('bot', result.answer);
    
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessage('bot', `Sorry, an error occurred: ${error.message}`);
        }
        this.saveChatHistories();
    }    

    addMessage(sender, text) {
        if (!this.activeChatId) return;
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();
        this.chatHistories[this.activeChatId].push({ sender, text });
        this.renderMessage(sender, text);
        this.saveChatHistories();
        if (sender === 'bot') {
            this.speak(text);
        }
    }

    // **MODIFIED**: This function now parses Markdown for bot messages.
    renderMessage(sender, text) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
    
        // If the message is from the bot, parse it as Markdown.
        // Otherwise, just replace newlines with <br> for user messages.
        const bubbleContent = (sender === 'bot') ? marked.parse(text) : text.replace(/\n/g, '<br>');
    
        messageDiv.innerHTML = `
            <div class="message-avatar"><i class="fas fa-${sender === 'user' ? 'user' : 'robot'}"></i></div>
            <div class="message-bubble">${bubbleContent}</div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    addWelcomeMessage() {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-robot"></i>
                <h3>Welcome, ${this.currentUser.username}!</h3>
                <p>Ask me anything about your division's academics.</p>
            </div>`;
    }

    renderChat() {
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = '';
        const currentChat = this.chatHistories[this.activeChatId] || [];
        if (currentChat.length === 0) {
            this.addWelcomeMessage();
        } else {
            currentChat.forEach(msg => this.renderMessage(msg.sender, msg.text));
        }
    }

    renderChatHistoryList() {
        const list = document.getElementById('chat-history-list');
        list.innerHTML = '';
        Object.keys(this.chatHistories).reverse().forEach(chatId => {
            const li = document.createElement('li');
            li.dataset.chatId = chatId;
    
            const firstUserMessage = this.chatHistories[chatId].find(m => m.sender === 'user');
            const chatTitle = firstUserMessage?.text.substring(0, 25) + (firstUserMessage?.text.length > 25 ? '...' : '') || 'New Chat';
    
            const titleSpan = document.createElement('span');
            titleSpan.className = 'chat-title';
            titleSpan.textContent = chatTitle;
            li.appendChild(titleSpan);
    
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn icon-btn delete-chat-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.title = 'Delete Chat';
            deleteBtn.dataset.chatId = chatId;
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteChatHistory(chatId);
            });
            li.appendChild(deleteBtn);
    
            if (chatId === this.activeChatId) {
                li.classList.add('active');
            }
    
            li.addEventListener('click', () => this.switchChat(chatId));
    
            list.appendChild(li);
        });
        document.getElementById('student-username').textContent = `User: ${this.currentUser.username}`;
    }

    deleteChatHistory(chatId) {
        if (!confirm('Are you sure you want to delete this chat history? This cannot be undone.')) {
            return;
        }
    
        delete this.chatHistories[chatId];
    
        this.saveChatHistories();
        
        if (this.activeChatId === chatId) {
            const remainingChatIds = Object.keys(this.chatHistories);
            if (remainingChatIds.length > 0) {
                this.switchChat(remainingChatIds[remainingChatIds.length - 1]);
            } else {
                this.startNewChat();
            }
        }
    
        this.renderChatHistoryList();
        this.showToast('Chat history deleted.', 'info');
    }

    updateFacultyInfo() {
        const infoText = `User: ${this.currentUser.username} (Div: ${this.currentUser.division})`;
        document.getElementById('upload-faculty-info').textContent = infoText;
        document.getElementById('manage-faculty-info').textContent = infoText;
        document.getElementById('analytics-faculty-info').textContent = infoText;
        document.getElementById('users-faculty-info').textContent = infoText;
    }
    
    populateDivisionSelector() {
        const selector = document.getElementById('division-selector');
        selector.innerHTML = `
            <option value="all">All Divisions</option>
            <option value="${this.currentUser.division}">Division ${this.currentUser.division} Only</option>
        `;
    }

    async processUpload() {
        const fileInput = document.getElementById('file-input');
        const category = document.getElementById('content-category').value;
        const division = document.getElementById('division-selector').value;
        const file = fileInput.files[0];

        if (!file || !category) return this.showToast('Please select a category and a file.', 'error');

        this.showLoading();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);
        formData.append('division', division);

        try {
            const response = await fetch(`${this.apiBaseUrl}/content/add`, {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            this.showToast(result.message, 'success');
            document.getElementById('uploaded-files').innerHTML = '';
            fileInput.value = '';
            this.updateUploadButton();
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async renderManageableDocuments() {
        const contentList = document.getElementById('manage-content-list');
        contentList.innerHTML = '<p>Loading documents...</p>';
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${this.currentUser.division}`);
            const documents = await response.json();
            if (!response.ok) throw new Error(documents.message);

            if (documents.length === 0) {
                contentList.innerHTML = '<p>No documents have been uploaded for your division yet.</p>';
                return;
            }
            contentList.innerHTML = '';
            documents.forEach(doc => {
                const item = document.createElement('div');
                item.className = 'manage-item';
                item.innerHTML = `
                    <div class="manage-item-info">
                        <span class="manage-item-category">${doc.category} (Div: ${doc.division})</span>
                        <span class="manage-item-title">${doc.fileName}</span>
                    </div>
                    <button class="btn btn--danger" data-id="${doc._id}">
                       <i class="fas fa-trash"></i> Remove
                    </button>`;
                item.querySelector('button').addEventListener('click', (e) => this.deleteDocument(e.currentTarget.getAttribute('data-id')));
                contentList.appendChild(item);
            });
        } catch (error) {
            contentList.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    async deleteDocument(docId) {
        if (!confirm('Are you sure you want to delete this document?')) return;
        this.showLoading();
        try {
            const response = await fetch(`${this.apiBaseUrl}/documents/${docId}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);

            this.showToast(result.message, 'success');
            await this.renderManageableDocuments();
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async renderAnalyticsDashboard() {
        const totalStat = document.getElementById('total-queries-stat');
        const topList = document.getElementById('top-queries-list');
        const unansweredList = document.getElementById('unanswered-queries-list');

        totalStat.textContent = '...';
        topList.innerHTML = '<li>Loading...</li>';
        unansweredList.innerHTML = '<li>Loading...</li>';

        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/${this.currentUser.division}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            totalStat.textContent = data.totalQueries;

            topList.innerHTML = data.topQueries.length > 0
                ? data.topQueries.map(q => `<li>"${q._id}" <span>(${q.count} times)</span></li>`).join('')
                : '<li>No queries yet.</li>';

            unansweredList.innerHTML = data.unansweredQueries.length > 0
                ? data.unansweredQueries.map(q => `<li>"${q.query}"</li>`).join('')
                : '<li>No unanswered queries found.</li>';
        } catch (error) {
            this.showToast(`Error fetching analytics: ${error.message}`, 'error');
            topList.innerHTML = '<li>Error loading data.</li>';
            unansweredList.innerHTML = '<li>Error loading data.</li>';
        }
    }
    
    async clearAnalyticsData() {
        if (!confirm(`Are you sure you want to permanently delete all query analytics for division ${this.currentUser.division}?`)) return;
        this.showLoading();
        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/${this.currentUser.division}`, {
                method: 'DELETE',
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            this.showToast(result.message, 'success');
            this.renderAnalyticsDashboard();
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async handleRegisterUser(e) {
        e.preventDefault();
        const form = document.getElementById('register-form');
        const username = document.getElementById('new-username').value.trim();
        const password = document.getElementById('new-password').value.trim();
        const role = document.getElementById('new-role').value;
        const division = document.getElementById('new-division').value.trim();

        if (!username || !password || !role || !division) {
            this.showToast('All fields are required.', 'error');
            return;
        }

        this.showLoading();
        try {
            const response = await fetch(`${this.apiBaseUrl}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role, division }),
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message);
            }

            this.showToast(result.message, 'success');
            form.reset();
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    handleFileSelect(files) {
        const uploadedFilesContainer = document.getElementById('uploaded-files');
        const fileInput = document.getElementById('file-input');
        uploadedFilesContainer.innerHTML = '';
        const file = files[0];
        if (file) {
            fileInput.files = files;
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `<span>${file.name}</span> <button class="btn btn--sm">&times;</button>`;
            fileItem.querySelector('button').addEventListener('click', () => { fileItem.remove(); fileInput.value = ''; this.updateUploadButton(); });
            uploadedFilesContainer.appendChild(fileItem);
        }
        this.updateUploadButton();
    }

    updateUploadButton() { document.getElementById('process-upload').disabled = !document.getElementById('file-input').files[0]; }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing-indicator-message';
        typingDiv.innerHTML = `
            <div class="message-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-bubble typing-indicator">
                <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.querySelector('.typing-indicator-message');
        if (typingIndicator) typingIndicator.remove();
    }

    showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); }
    hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    saveChatHistories() {
        localStorage.setItem(`chatHistories_${this.currentUser.username}`, JSON.stringify(this.chatHistories));
    }

    loadChatHistories() {
        const stored = localStorage.getItem(`chatHistories_${this.currentUser.username}`);
        if (stored) {
            this.chatHistories = JSON.parse(stored);
            const chatIds = Object.keys(this.chatHistories);
            if (chatIds.length > 0) {
                this.activeChatId = chatIds[chatIds.length - 1];
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new ChatbotApp());
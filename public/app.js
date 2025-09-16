class PapyrusLiteApp {
  constructor() {
    // Detect if we're in production and force polling transport
    const isProduction = window.location.hostname !== 'localhost';
    
    this.socket = io({
      timeout: 20000, // Reduced from 45s to 20s for faster failure detection
      reconnection: true,
      reconnectionDelay: 1000, // Start with 1s delay
      reconnectionDelayMax: 5000, // Max 5s between attempts
      reconnectionAttempts: 15, // More attempts with shorter delays
      randomizationFactor: 0.5,
      transports: isProduction ? ['polling'] : ['websocket', 'polling'],
      upgrade: false, // Disable upgrade in production
      rememberUpgrade: false,
      forceNew: false,
      // Additional production-specific settings
      pingTimeout: 60000, // 60s ping timeout
      pingInterval: 25000, // 25s ping interval
      autoConnect: true,
      forceBase64: false
    });
    this.currentModal = null;
    this.commandHistory = [];
    this.historyIndex = -1;
    this.autocompleteIndex = -1;
    this.currentData = {};
    this.hasInitialized = false;
    this.aiTimeout = null;
    this.linkTimeout = null;
    this.connectionRetryTimeout = null;
    
    this.initializeElements();
    this.setupEventListeners();
    this.setupSocketListeners();
    
    console.log('Papyrus Lite initialized');
  }

  initializeElements() {
    this.elements = {
      commandInput: document.getElementById('command-input'),
      output: document.getElementById('output'),
      modalOverlay: document.getElementById('modal-overlay'),
      modalContent: document.getElementById('modal-content'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalBack: document.getElementById('modal-back'),
      autocompleteDropdown: document.getElementById('autocomplete-dropdown'),
      loading: document.getElementById('loading'),
      errorToast: document.getElementById('error-toast'),
      successToast: document.getElementById('success-toast'),
      errorMessage: document.getElementById('error-message'),
      successMessage: document.getElementById('success-message'),
      errorClose: document.getElementById('error-close'),
      successClose: document.getElementById('success-close')
    };
  }

  setupEventListeners() {
    // Command input
    this.elements.commandInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.elements.commandInput.addEventListener('input', (e) => this.handleInput(e));
    this.elements.commandInput.addEventListener('blur', (e) => {
      // Delay hiding autocomplete to allow clicks to register
      setTimeout(() => this.hideAutocomplete(), 150);
    });

    // Modal
    this.elements.modalBack.addEventListener('click', () => this.hideModal());
    this.elements.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.elements.modalOverlay) {
        this.hideModal();
      }
    });

    // Toast close buttons
    this.elements.errorClose.addEventListener('click', () => this.hideError());
    this.elements.successClose.addEventListener('click', () => this.hideSuccess());

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.elements.modalOverlay.classList.contains('hidden')) {
          this.hideModal();
        } else {
          this.hideAutocomplete();
        }
      }
    });

    // Focus command input on page load
    this.elements.commandInput.focus();
  }

  setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
      // Clear any error messages on successful connection
      this.hideError();
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected to server after', attemptNumber, 'attempts');
      this.hideError();
      this.addOutput('Reconnected to server.', 'system');
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Reconnection attempt', attemptNumber);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Reconnection failed:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect after all attempts');
      this.clearAllTimeouts();
      this.hideLoading();
      this.showError('Unable to reconnect to server after multiple attempts. Please refresh the page or check your connection.');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server, reason:', reason);
      // Clear any pending timeouts and hide loading
      this.clearAllTimeouts();
      this.hideLoading();
      
      // Only show error for unexpected disconnections
      if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
        let disconnectMessage = 'Connection lost. Attempting to reconnect...';
        if (reason === 'ping timeout') {
          disconnectMessage = 'Connection timed out. Reconnecting...';
        } else if (reason === 'transport error') {
          disconnectMessage = 'Network error. Reconnecting...';
        } else if (reason === 'transport close') {
          disconnectMessage = 'Connection closed. Reconnecting...';
        }
        this.showError(disconnectMessage);
      }
    });

    this.socket.on('init', (data) => {
      console.log('Received initial data:', data);
      this.currentData = data;
      // Only show ready message on first connection
      if (!this.hasInitialized) {
        this.addOutput('Ready. Type /help for commands.', 'system');
        this.hasInitialized = true;
      }
    });

    this.socket.on('commandResult', (result) => {
      this.handleCommandResult(result);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      // Clear any pending timeouts and hide loading
      this.clearAllTimeouts();
      this.hideLoading();
      
      // More specific error messages based on error type
      let errorMessage = 'Failed to connect to server.';
      if (error.message && error.message.includes('xhr poll error')) {
        errorMessage = 'Network connection failed. Retrying...';
      } else if (error.message && error.message.includes('timeout')) {
        errorMessage = 'Connection timeout. Retrying...';
      } else if (error.message && error.message.includes('502')) {
        errorMessage = 'Server temporarily unavailable. Retrying...';
      }
      
      this.showError(errorMessage);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.clearAllTimeouts();
      this.hideLoading();
      
      let errorMessage = 'Socket error occurred.';
      if (error && error.message) {
        errorMessage = `Socket error: ${error.message}`;
      }
      this.showError(errorMessage);
    });

    this.socket.on('promptsUpdated', (prompts) => {
      this.currentData.prompts = prompts;
    });

    this.socket.on('substitutesUpdated', (substitutes) => {
      this.currentData.substitutes = substitutes;
    });

    this.socket.on('systemInstructionsUpdated', (instructions) => {
      this.currentData.systemInstructions = instructions;
    });

    this.socket.on('aiModelUpdated', (model) => {
      this.currentData.aiModel = model;
    });

    this.socket.on('rootPathUpdated', (rootPath) => {
      this.currentData.rootPath = rootPath;
    });

    this.socket.on('aiResponse', (data) => {
      this.handleAIResponse(data);
    });

    this.socket.on('aiError', (error) => {
      // Clear timeout if error received
      if (this.aiTimeout) {
        clearTimeout(this.aiTimeout);
        this.aiTimeout = null;
      }
      
      this.showError(`AI Error: ${error.message}`);
      this.hideLoading();
    });

    this.socket.on('exportSuccess', (data) => {
      this.showSuccess(`Content exported to: ${data.filePath}`);
    });

    this.socket.on('linksProcessed', (data) => {
      this.updatePreviewContent(data.processed);
    });

    this.socket.on('fileChanged', (data) => {
      console.log('File changed:', data.filePath);
    });
  }

  handleKeyDown(e) {
    const dropdown = this.elements.autocompleteDropdown;
    const items = dropdown.querySelectorAll('.autocomplete-item');

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (!dropdown.classList.contains('hidden')) {
          if (this.autocompleteIndex >= 0) {
            // User has selected a specific item with arrow keys
            const selectedItem = items[this.autocompleteIndex];
            if (selectedItem) {
              this.elements.commandInput.value = selectedItem.dataset.command;
              this.hideAutocomplete();
              this.executeCommand();
            }
          } else if (items.length > 0) {
            // No specific selection, auto-complete with first match
            const firstItem = items[0];
            this.elements.commandInput.value = firstItem.dataset.command;
            this.hideAutocomplete();
            this.executeCommand();
          } else {
            // No autocomplete suggestions, execute as-is
            this.executeCommand();
          }
        } else {
          this.executeCommand();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (!dropdown.classList.contains('hidden')) {
          this.autocompleteIndex = Math.max(0, this.autocompleteIndex - 1);
          this.updateAutocompleteSelection(items);
        } else {
          this.navigateHistory(-1);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (!dropdown.classList.contains('hidden')) {
          this.autocompleteIndex = Math.min(items.length - 1, this.autocompleteIndex + 1);
          this.updateAutocompleteSelection(items);
        } else {
          this.navigateHistory(1);
        }
        break;

      case 'Tab':
        e.preventDefault();
        if (!dropdown.classList.contains('hidden') && items.length > 0) {
          this.elements.commandInput.value = items[0].dataset.command;
          this.hideAutocomplete();
        }
        break;

      case 'Escape':
        this.hideAutocomplete();
        break;
    }
  }

  handleInput(e) {
    const value = e.target.value;
    if (value.length > 0) {
      this.showAutocomplete(value);
    } else {
      this.hideAutocomplete();
    }
  }

  showAutocomplete(input) {
    const commands = [
      { name: '/restart', description: 'Restart the CLI and clear history' },
      { name: '/prompts', description: 'Manage prompts' },
      { name: '/subs', description: 'Manage substitutes' },
      { name: '/system', description: 'Edit system instructions' },
      { name: '/ai-model', description: 'Select AI model' },
      { name: '/root', description: 'Set root folder path' },
      { name: '/help', description: 'Show help information' }
    ];

    // Add prompts to autocomplete
    if (this.currentData.prompts) {
      Object.keys(this.currentData.prompts).forEach(promptName => {
        commands.push({
          name: `/${promptName}`,
          description: `Prompt: ${this.currentData.prompts[promptName].substring(0, 50)}...`,
          type: 'prompt'
        });
      });
    }

    const filtered = commands.filter(cmd => 
      cmd.name.toLowerCase().includes(input.toLowerCase())
    );

    if (filtered.length === 0) {
      this.hideAutocomplete();
      return;
    }

    const dropdown = this.elements.autocompleteDropdown;
    dropdown.innerHTML = '';

    filtered.forEach((cmd, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.dataset.command = cmd.name;
      
      const nameSpan = document.createElement('div');
      nameSpan.className = cmd.type === 'prompt' ? 'autocomplete-prompt' : 'autocomplete-command';
      nameSpan.textContent = cmd.name;
      
      const descSpan = document.createElement('div');
      descSpan.className = 'autocomplete-description';
      descSpan.textContent = cmd.description;
      
      item.appendChild(nameSpan);
      item.appendChild(descSpan);
      
      item.addEventListener('mousedown', (e) => {
        // Use mousedown instead of click to fire before blur
        e.preventDefault();
        this.elements.commandInput.value = cmd.name;
        this.hideAutocomplete();
        this.executeCommand();
      });
      
      dropdown.appendChild(item);
    });

    // Determine optimal positioning
    this.positionDropdown(dropdown);
    
    dropdown.classList.remove('hidden');
    this.autocompleteIndex = -1;
  }

  positionDropdown(dropdown) {
    const inputContainer = document.getElementById('input-container');
    const inputRect = inputContainer.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownMaxHeight = 200; // matches CSS max-height
    
    // Calculate space above and below
    const spaceAbove = inputRect.top;
    const spaceBelow = viewportHeight - inputRect.bottom;
    
    // Remove existing positioning classes
    dropdown.classList.remove('dropdown-above', 'dropdown-below');
    
    // Position based on available space
    if (spaceBelow >= dropdownMaxHeight || spaceBelow >= spaceAbove) {
      // Show below if there's enough space below, or if there's more space below than above
      dropdown.classList.add('dropdown-below');
    } else {
      // Show above if there's more space above
      dropdown.classList.add('dropdown-above');
    }
  }

  hideAutocomplete() {
    this.elements.autocompleteDropdown.classList.add('hidden');
    this.autocompleteIndex = -1;
  }

  updateAutocompleteSelection(items) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.autocompleteIndex);
    });
  }

  navigateHistory(direction) {
    if (this.commandHistory.length === 0) return;

    if (direction === -1) {
      this.historyIndex = Math.max(0, this.historyIndex - 1);
    } else {
      this.historyIndex = Math.min(this.commandHistory.length - 1, this.historyIndex + 1);
    }

    this.elements.commandInput.value = this.commandHistory[this.historyIndex] || '';
  }

  executeCommand() {
    const input = this.elements.commandInput.value.trim();
    if (!input) return;

    this.addOutput(`> ${input}`, 'command');
    this.commandHistory.unshift(input);
    this.historyIndex = -1;
    this.elements.commandInput.value = '';
    this.hideAutocomplete();

    // Parse command and arguments
    const parts = input.split(' ');
    let command = parts[0];
    const args = parts.slice(1);

    // Remove leading slash if present
    if (command.startsWith('/')) {
      command = command.substring(1);
    }

    // Handle help command locally
    if (command === 'help') {
      this.showHelp();
      return;
    }

    this.showLoading();
    this.socket.emit('command', { command, args });
  }

  handleCommandResult(result) {
    this.hideLoading();

    switch (result.type) {
      case 'restart':
        this.elements.output.innerHTML = '';
        break;

      case 'ui':
        this.showUI(result.component, result.data);
        break;

      default:
        if (result.message && result.message !== 'Command executed') {
          this.addOutput(result.message, 'result');
        }
    }
  }

  showUI(component, data) {
    this.currentModal = component;

    switch (component) {
      case 'prompts':
        this.showPromptsUI(data);
        break;
      case 'substitutes':
        this.showSubstitutesUI(data);
        break;
      case 'system':
        this.showSystemUI(data);
        break;
      case 'aiModel':
        this.showAIModelUI(data);
        break;
      case 'root':
        this.showRootUI(data);
        break;
      case 'promptPreview':
        this.showPromptPreview(data);
        break;
    }
  }

  // UI Methods - Part 1
  showPromptsUI(prompts) {
    this.elements.modalTitle.textContent = 'Manage Prompts';
    
    const html = `
      <div class="form-group">
        <button class="btn btn-primary" onclick="app.addNewPrompt()">Add New Prompt</button>
      </div>
      <div class="item-list" id="prompts-list">
        ${Object.entries(prompts).map(([name, content]) => `
          <div class="item-list-item">
            <div>
              <div class="item-name">${this.escapeHtml(name)}</div>
              <div class="item-content">${this.escapeHtml(content.substring(0, 100))}${content.length > 100 ? '...' : ''}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-small btn-secondary" onclick="app.editPrompt('${this.escapeHtml(name)}')">Edit</button>
              <button class="btn btn-small btn-error" onclick="app.deletePrompt('${this.escapeHtml(name)}')">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.showModal();
  }

  showSubstitutesUI(substitutes) {
    this.elements.modalTitle.textContent = 'Manage Substitutes';
    
    const html = `
      <div class="form-group">
        <button class="btn btn-primary" onclick="app.addNewSubstitute()">Add New Substitute</button>
      </div>
      <div class="item-list" id="substitutes-list">
        ${Object.entries(substitutes).map(([name, content]) => `
          <div class="item-list-item">
            <div>
              <div class="item-name">${this.escapeHtml(name)}</div>
              <div class="item-content">${this.escapeHtml(content.substring(0, 100))}${content.length > 100 ? '...' : ''}</div>
            </div>
            <div class="item-actions">
              <button class="btn btn-small btn-secondary" onclick="app.editSubstitute('${this.escapeHtml(name)}')">Edit</button>
              <button class="btn btn-small btn-error" onclick="app.deleteSubstitute('${this.escapeHtml(name)}')">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.showModal();
  }

  showSystemUI(instructions) {
    this.elements.modalTitle.textContent = 'System Instructions';
    
    const html = `
      <div class="form-group">
        <label class="form-label">System Instructions for AI:</label>
        <textarea class="form-textarea" id="system-instructions" rows="10">${this.escapeHtml(instructions)}</textarea>
      </div>
      <div class="btn-group btn-group-right">
        <button class="btn btn-primary" onclick="app.saveSystemInstructions()">Save</button>
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.showModal();
  }

  showAIModelUI(data) {
    this.elements.modalTitle.textContent = 'Select AI Model';
    
    const html = `
      <div class="form-group">
        <label class="form-label">Available Models:</label>
        <select class="form-select" id="ai-model-select">
          ${data.available.map(model => `
            <option value="${model}" ${model === data.current ? 'selected' : ''}>
              ${model === 'claude-3-5-sonnet-20241022' ? 'Claude 3.5 Sonnet (Most Capable)' : 'Claude 3 Haiku (Fast & Efficient)'}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="btn-group btn-group-right">
        <button class="btn btn-primary" onclick="app.saveAIModel()">Save</button>
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.showModal();
  }

  showRootUI(currentPath) {
    this.elements.modalTitle.textContent = 'Set Root Folder Path';
    
    const html = `
      <div class="form-group">
        <label class="form-label">Root Folder Path:</label>
        <input type="text" class="form-input" id="root-path" value="${this.escapeHtml(currentPath)}" placeholder="/path/to/your/files">
        <small style="color: var(--text-muted); margin-top: 4px; display: block;">
          This is where {{}} file links will be resolved from. Must be an existing directory.
        </small>
      </div>
      <div class="btn-group btn-group-right">
        <button class="btn btn-primary" onclick="app.saveRootPath()">Save</button>
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.showModal();
  }

  showPromptPreview(data) {
    this.elements.modalTitle.textContent = data.isPrompt ? `Prompt: ${data.name}` : 'Content Preview';
    
    const html = `
      <div class="preview-container">
        <div class="preview-header">
          <span class="preview-title">${data.isPrompt ? 'Prompt Content' : 'Rendered Content'}</span>
          <div class="preview-toggle">
            <button class="btn btn-small" id="render-toggle" onclick="app.toggleRender()">Raw</button>
          </div>
        </div>
        <div class="preview-content preview-rendered" id="preview-content"></div>
      </div>
      <div class="btn-group btn-group-center mt-2">
        <button class="btn btn-secondary" onclick="app.copyContent()">Copy</button>
        <button class="btn btn-primary" onclick="app.sendToAI()">Send to AI</button>
        <button class="btn btn-warning" onclick="app.exportContent()">Export</button>
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.currentPreviewContent = data.content;
    this.isRendered = true;
    this.showModal();
    
    // Automatically render the content on load
    this.showLoading();
    
    // Set a timeout for link processing
    this.linkTimeout = setTimeout(() => {
      this.hideLoading();
      this.showError('Link processing timed out. Please try again.');
    }, 30000); // 30 second timeout for link processing
    
    this.socket.emit('processLinks', { content: data.content });
  }

  // Prompt management methods
  addNewPrompt() {
    const name = prompt('Enter prompt name:');
    if (!name) return;
    
    if (this.currentData.prompts[name]) {
      this.showError('Prompt name already exists');
      return;
    }
    
    this.editPrompt(name, '');
  }

  editPrompt(name, content = null) {
    if (content === null) {
      content = this.currentData.prompts[name] || '';
    }
    
    const html = `
      <div class="form-group">
        <label class="form-label">Prompt Name:</label>
        <input type="text" class="form-input" id="prompt-name" value="${this.escapeHtml(name)}" ${content !== '' ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label class="form-label">Prompt Content:</label>
        <textarea class="form-textarea" id="prompt-content" rows="15">${this.escapeHtml(content)}</textarea>
      </div>
      <div class="btn-group btn-group-right">
        <button class="btn btn-secondary" onclick="app.showPromptsUI(app.currentData.prompts)">Cancel</button>
        <button class="btn btn-primary" onclick="app.savePrompt()">Save</button>
      </div>
    `;
    
    this.elements.modalTitle.textContent = content === '' ? 'Add New Prompt' : 'Edit Prompt';
    this.elements.modalBody.innerHTML = html;
  }

  savePrompt() {
    const name = document.getElementById('prompt-name').value.trim();
    const content = document.getElementById('prompt-content').value;
    
    if (!name) {
      this.showError('Prompt name is required');
      return;
    }
    
    const reservedCommands = ['restart', 'prompts', 'subs', 'system', 'ai-model', 'root', 'help'];
    if (reservedCommands.includes(name)) {
      this.showError(`"${name}" is a reserved command name`);
      return;
    }
    
    const updatedPrompts = { ...this.currentData.prompts };
    updatedPrompts[name] = content;
    
    this.socket.emit('updatePrompts', updatedPrompts);
    this.showSuccess('Prompt saved successfully');
    this.showPromptsUI(updatedPrompts);
  }

  deletePrompt(name) {
    if (!confirm(`Delete prompt "${name}"?`)) return;
    
    const updatedPrompts = { ...this.currentData.prompts };
    delete updatedPrompts[name];
    
    this.socket.emit('updatePrompts', updatedPrompts);
    this.showSuccess('Prompt deleted successfully');
    this.showPromptsUI(updatedPrompts);
  }

  // Substitute management methods
  addNewSubstitute() {
    const name = prompt('Enter substitute name:');
    if (!name) return;
    
    if (this.currentData.substitutes[name]) {
      this.showError('Substitute name already exists');
      return;
    }
    
    this.editSubstitute(name, '');
  }

  editSubstitute(name, content = null) {
    if (content === null) {
      content = this.currentData.substitutes[name] || '';
    }
    
    const html = `
      <div class="form-group">
        <label class="form-label">Substitute Name:</label>
        <input type="text" class="form-input" id="substitute-name" value="${this.escapeHtml(name)}" ${content !== '' ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label class="form-label">Substitute Content:</label>
        <textarea class="form-textarea" id="substitute-content" rows="10">${this.escapeHtml(content)}</textarea>
        <small style="color: var(--text-muted); margin-top: 4px; display: block;">
          Use {{substitute-name}} or {{path/to/file.md}} to reference other substitutes or files.
        </small>
      </div>
      <div class="btn-group btn-group-right">
        <button class="btn btn-secondary" onclick="app.showSubstitutesUI(app.currentData.substitutes)">Cancel</button>
        <button class="btn btn-primary" onclick="app.saveSubstitute()">Save</button>
      </div>
    `;
    
    this.elements.modalTitle.textContent = content === '' ? 'Add New Substitute' : 'Edit Substitute';
    this.elements.modalBody.innerHTML = html;
  }

  saveSubstitute() {
    const name = document.getElementById('substitute-name').value.trim();
    const content = document.getElementById('substitute-content').value;
    
    if (!name) {
      this.showError('Substitute name is required');
      return;
    }
    
    const updatedSubstitutes = { ...this.currentData.substitutes };
    updatedSubstitutes[name] = content;
    
    this.socket.emit('updateSubstitutes', updatedSubstitutes);
    this.showSuccess('Substitute saved successfully');
    this.showSubstitutesUI(updatedSubstitutes);
  }

  deleteSubstitute(name) {
    if (!confirm(`Delete substitute "${name}"?`)) return;
    
    const updatedSubstitutes = { ...this.currentData.substitutes };
    delete updatedSubstitutes[name];
    
    this.socket.emit('updateSubstitutes', updatedSubstitutes);
    this.showSuccess('Substitute deleted successfully');
    this.showSubstitutesUI(updatedSubstitutes);
  }

  // System settings methods
  saveSystemInstructions() {
    const instructions = document.getElementById('system-instructions').value;
    this.socket.emit('updateSystemInstructions', instructions);
    this.showSuccess('System instructions saved successfully');
    this.hideModal();
  }

  saveAIModel() {
    const model = document.getElementById('ai-model-select').value;
    this.socket.emit('updateAIModel', model);
    this.showSuccess('AI model updated successfully');
    this.hideModal();
  }

  saveRootPath() {
    const rootPath = document.getElementById('root-path').value.trim();
    if (!rootPath) {
      this.showError('Root path is required');
      return;
    }
    
    this.socket.emit('updateRootPath', rootPath);
  }

  // Preview methods
  toggleRender() {
    const button = document.getElementById('render-toggle');
    const content = document.getElementById('preview-content');
    
    if (this.isRendered) {
      // Switch to raw
      content.innerHTML = this.escapeHtml(this.currentPreviewContent);
      content.classList.remove('preview-rendered');
      button.textContent = 'Render';
      this.isRendered = false;
    } else {
      // Process links and render
      this.showLoading();
      
      // Set a timeout for link processing
      this.linkTimeout = setTimeout(() => {
        this.hideLoading();
        this.showError('Link processing timed out. Please try again.');
      }, 30000); // 30 second timeout for link processing
      
      this.socket.emit('processLinks', { content: this.currentPreviewContent });
      button.textContent = 'Raw';
    }
  }

  updatePreviewContent(processedContent) {
    // Clear timeout if response received
    if (this.linkTimeout) {
      clearTimeout(this.linkTimeout);
      this.linkTimeout = null;
    }
    
    this.hideLoading();
    const content = document.getElementById('preview-content');
    if (content) {
      content.innerHTML = marked.parse(processedContent);
      content.classList.add('preview-rendered');
      this.isRendered = true;
      this.currentProcessedContent = processedContent;
    }
  }

  copyContent() {
    const contentToCopy = this.isRendered ? this.currentProcessedContent : this.currentPreviewContent;
    navigator.clipboard.writeText(contentToCopy).then(() => {
      this.showSuccess('Content copied to clipboard');
    }).catch(() => {
      this.showError('Failed to copy content');
    });
  }

  sendToAI() {
    const contentToSend = this.isRendered ? this.currentProcessedContent : this.currentPreviewContent;
    this.showAIChat(contentToSend);
  }

  exportContent() {
    const filePath = prompt('Enter file path (must end with .md):');
    if (!filePath) return;
    
    if (!filePath.endsWith('.md')) {
      this.showError('File path must end with .md extension');
      return;
    }
    
    const contentToExport = this.isRendered ? this.currentProcessedContent : this.currentPreviewContent;
    this.socket.emit('exportContent', { content: contentToExport, filePath });
  }

  // AI Chat methods
  showAIChat(initialContent) {
    this.elements.modalTitle.textContent = 'AI Chat';
    this.currentConversationId = 'conv_' + Date.now();
    this.currentConversation = [];
    
    const html = `
      <div class="chat-container">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-container">
          <textarea class="chat-input" id="chat-input" placeholder="Type your follow-up message..."></textarea>
          <button class="chat-send" id="chat-send" onclick="app.sendChatMessage()">Send</button>
        </div>
      </div>
    `;
    
    this.elements.modalBody.innerHTML = html;
    this.showModal();
    
    // Send initial content to AI
    this.sendInitialMessage(initialContent);
  }

  sendInitialMessage(content) {
    this.addChatMessage('user', content);
    this.showLoading();
    
    // Set a timeout to hide loading if no response received
    this.aiTimeout = setTimeout(() => {
      this.hideLoading();
      this.showError('AI request timed out. Please try again.');
    }, 60000); // 60 second timeout
    
    this.socket.emit('sendToAI', {
      content: content,
      conversationId: this.currentConversationId,
      systemInstructions: this.currentData.systemInstructions
    });
  }

  sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    input.value = '';
    this.addChatMessage('user', message);
    
    // Build conversation context
    const conversationContext = this.currentConversation.map(msg => 
      `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
    ).join('\n\n') + `\n\nHuman: ${message}`;
    
    this.showLoading();
    
    // Set a timeout to hide loading if no response received
    this.aiTimeout = setTimeout(() => {
      this.hideLoading();
      this.showError('AI request timed out. Please try again.');
    }, 60000); // 60 second timeout
    
    this.socket.emit('sendToAI', {
      content: conversationContext,
      conversationId: this.currentConversationId,
      systemInstructions: this.currentData.systemInstructions
    });
  }

  addChatMessage(role, content) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const timestamp = new Date().toLocaleTimeString();
    
    messageDiv.innerHTML = `
      <div class="chat-message-header">
        <span class="chat-message-role">${role === 'user' ? 'You' : 'AI'}</span>
        <span class="chat-message-time">${timestamp}</span>
      </div>
      <div class="chat-message-content">${role === 'ai' ? marked.parse(content) : this.escapeHtml(content)}</div>
      ${role === 'ai' ? `
        <div class="chat-message-actions">
          <button class="btn btn-small btn-secondary" onclick="app.copyChatMessage(this)">Copy</button>
          <button class="btn btn-small btn-warning" onclick="app.exportChatMessage(this)">Export</button>
        </div>
      ` : ''}
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Store in conversation history
    this.currentConversation.push({ role, content, timestamp });
  }

  handleAIResponse(data) {
    // Clear timeout if response received
    if (this.aiTimeout) {
      clearTimeout(this.aiTimeout);
      this.aiTimeout = null;
    }
    
    this.hideLoading();
    this.addChatMessage('ai', data.response);
  }

  copyChatMessage(button) {
    const messageContent = button.closest('.chat-message').querySelector('.chat-message-content').textContent;
    navigator.clipboard.writeText(messageContent).then(() => {
      this.showSuccess('Message copied to clipboard');
    }).catch(() => {
      this.showError('Failed to copy message');
    });
  }

  exportChatMessage(button) {
    const messageContent = button.closest('.chat-message').querySelector('.chat-message-content').textContent;
    const filePath = prompt('Enter file path (must end with .md):');
    if (!filePath) return;
    
    if (!filePath.endsWith('.md')) {
      this.showError('File path must end with .md extension');
      return;
    }
    
    this.socket.emit('exportContent', { content: messageContent, filePath });
  }

  // Utility methods
  showHelp() {
    const helpText = `
Papyrus Lite - AI Prompt Manager

Available Commands:
/restart - Restart the CLI and clear history
/prompts - Manage prompts (add, edit, delete)
/subs - Manage substitutes for link replacement
/system - Edit AI system instructions
/ai-model - Select AI model (Claude 3.5 Sonnet or Claude 3 Haiku)
/root - Set root folder path for file links
/help - Show this help information

Prompt Usage:
- Type /[prompt-name] to preview and use any saved prompt
- Type any text with {{}} links to preview and process
- Links can reference substitutes or file paths
- File links are relative to the root folder path

Link Syntax:
{{filename.md}} - Include single file
{{folder/*}} - Include all files from folder (sorted alphabetically)
{{substitute-name}} - Include substitute content

Supported file types: .md, .txt

Keyboard Shortcuts:
- Up/Down arrows: Navigate command history or autocomplete
- Tab: Accept first autocomplete suggestion
- Escape: Close modals or hide autocomplete
- Enter: Execute command or accept autocomplete

Features:
- Recursive link substitution
- Folder wildcard inclusion with /*
- AI chat with conversation history
- Export content to .md files
- Copy content to clipboard
- File system monitoring for changes
- Persistent data across sessions
    `;
    
    this.addOutput(helpText, 'result');
  }

  addOutput(text, type = 'result') {
    const outputDiv = document.createElement('div');
    outputDiv.className = `output-line output-${type}`;
    outputDiv.textContent = text;
    this.elements.output.appendChild(outputDiv);
    this.elements.output.scrollTop = this.elements.output.scrollHeight;
  }

  showModal() {
    this.elements.modalOverlay.classList.remove('hidden');
  }

  hideModal() {
    this.elements.modalOverlay.classList.add('hidden');
    this.currentModal = null;
  }

  showLoading() {
    this.elements.loading.classList.remove('hidden');
  }

  hideLoading() {
    this.elements.loading.classList.add('hidden');
  }

  showError(message) {
    this.elements.errorMessage.textContent = message;
    this.elements.errorToast.classList.remove('hidden');
    setTimeout(() => this.hideError(), 5000);
  }

  hideError() {
    this.elements.errorToast.classList.add('hidden');
  }

  showSuccess(message) {
    this.elements.successMessage.textContent = message;
    this.elements.successToast.classList.remove('hidden');
    setTimeout(() => this.hideSuccess(), 3000);
  }

  hideSuccess() {
    this.elements.successToast.classList.add('hidden');
  }

  clearAllTimeouts() {
    if (this.aiTimeout) {
      clearTimeout(this.aiTimeout);
      this.aiTimeout = null;
    }
    if (this.linkTimeout) {
      clearTimeout(this.linkTimeout);
      this.linkTimeout = null;
    }
    if (this.connectionRetryTimeout) {
      clearTimeout(this.connectionRetryTimeout);
      this.connectionRetryTimeout = null;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new PapyrusLiteApp();
});

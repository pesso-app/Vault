        // Variables globales
        let masterPassword = '';
        let passwords = [];
        let editingId = null;
        let deferredPrompt = null;

        // Inicialización PWA
        window.onload = function() {
            checkFirstTime();
            setupStrengthMeter();
            setupPWA();
            setupOfflineDetection();
        };

        // PWA Functions
        function setupPWA() {
            // Registrar Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('data:text/javascript;base64,' + btoa(`
                    const CACHE_NAME = 'vault-v2';
                    const urlsToCache = [
                        '/',
                        'https://cdn.tailwindcss.com',
                        'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
                        'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap'
                    ];

                    self.addEventListener('install', event => {
                        event.waitUntil(
                            caches.open(CACHE_NAME)
                                .then(cache => cache.addAll(urlsToCache))
                        );
                        self.skipWaiting();
                    });

                    self.addEventListener('fetch', event => {
                        event.respondWith(
                            caches.match(event.request)
                                .then(response => {
                                    if (response) return response;
                                    return fetch(event.request).catch(() => {
                                        // Fallback para offline
                                        if (event.request.mode === 'navigate') {
                                            return caches.match('/');
                                        }
                                    });
                                })
                        );
                    });

                    self.addEventListener('activate', event => {
                        event.waitUntil(self.clients.claim());
                    });
                `)).then(registration => {
                    console.log('SW registrado:', registration);
                }).catch(error => {
                    console.log('SW error:', error);
                });
            }

            // Detectar si es instalable
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                
                // Mostrar banner solo si no está instalada
                if (!window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
                    setTimeout(() => {
                        document.getElementById('installBanner').classList.remove('hidden');
                    }, 2000);
                }
            });

            // Detectar si ya está instalada
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
                document.body.classList.add('standalone');
            }
        }

        function installPWA() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        showToast('Instalando Vault...', 'success');
                    }
                    deferredPrompt = null;
                    document.getElementById('installBanner').classList.add('hidden');
                });
            } else {
                // Para iOS Safari
                showToast('En iOS: Compartir > "Añadir a pantalla de inicio"', 'info');
            }
        }

        function dismissInstall() {
            document.getElementById('installBanner').classList.add('hidden');
            localStorage.setItem('vault_dismissed_install', Date.now());
        }

        function setupOfflineDetection() {
            function updateOnlineStatus() {
                const indicator = document.getElementById('offlineIndicator');
                if (!navigator.onLine) {
                    indicator.classList.add('show');
                    showToast('Modo offline activado', 'info');
                } else {
                    indicator.classList.remove('show');
                }
            }

            window.addEventListener('online', updateOnlineStatus);
            window.addEventListener('offline', updateOnlineStatus);
            updateOnlineStatus();
        }

        // Resto de funciones (igual que antes)
        function checkFirstTime() {
            const stored = localStorage.getItem('vault_salt');
            if (!stored) {
                document.getElementById('setupMode').classList.remove('hidden');
                document.getElementById('unlockMode').classList.add('hidden');
            }
        }

        function setupStrengthMeter() {
            const input = document.getElementById('newMasterPassword');
            const bar = document.getElementById('strengthBar');
            
            input.addEventListener('input', function() {
                const val = this.value;
                let strength = 0;
                if (val.length > 8) strength += 25;
                if (val.match(/[a-z]+/)) strength += 25;
                if (val.match(/[A-Z]+/)) strength += 25;
                if (val.match(/[0-9]+/)) strength += 25;
                
                bar.style.width = strength + '%';
                if (strength < 50) bar.className = 'password-strength bg-red-500';
                else if (strength < 75) bar.className = 'password-strength bg-yellow-500';
                else bar.className = 'password-strength bg-green-500';
            });
        }

        function setupMasterPassword() {
            const pass = document.getElementById('newMasterPassword').value;
            const confirm = document.getElementById('confirmMasterPassword').value;
            
            if (pass.length < 8) {
                showToast('La contraseña debe tener al menos 8 caracteres', 'error');
                return;
            }
            if (pass !== confirm) {
                showToast('Las contraseñas no coinciden', 'error');
                return;
            }
            
            localStorage.setItem('vault_salt', CryptoJS.SHA256(pass).toString());
            masterPassword = pass;
            
            showToast('Bóveda creada exitosamente', 'success');
            setTimeout(() => unlockVault(), 500);
        }

        function unlockVault() {
            const input = document.getElementById('masterPassword').value;
            const stored = localStorage.getItem('vault_salt');
            const hash = CryptoJS.SHA256(input).toString();
            
            if (stored && hash !== stored) {
                showToast('Contraseña incorrecta', 'error');
                // Haptic feedback si está disponible
                if (navigator.vibrate) navigator.vibrate(200);
                return;
            }
            
            masterPassword = input;
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            loadPasswords();
            
            // Haptic success
            if (navigator.vibrate) navigator.vibrate(50);
        }

        function lockVault() {
            masterPassword = '';
            document.getElementById('mainApp').classList.add('hidden');
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('masterPassword').value = '';
            passwords = [];
        }

        function encrypt(text) {
            return CryptoJS.AES.encrypt(text, masterPassword).toString();
        }

        function decrypt(ciphertext) {
            try {
                const bytes = CryptoJS.AES.decrypt(ciphertext, masterPassword);
                return bytes.toString(CryptoJS.enc.Utf8);
            } catch(e) {
                return '';
            }
        }

        function loadPasswords() {
            const stored = localStorage.getItem('vault_data');
            passwords = stored ? JSON.parse(stored) : [];
            renderPasswords();
        }

        function saveToStorage() {
            localStorage.setItem('vault_data', JSON.stringify(passwords));
        }

        function renderPasswords(filter = '') {
            const grid = document.getElementById('passwordsGrid');
            const empty = document.getElementById('emptyState');
            const count = document.getElementById('passwordCount');
            
            grid.innerHTML = '';
            
            const filtered = passwords.filter(p => {
                const site = decrypt(p.site).toLowerCase();
                const user = decrypt(p.username).toLowerCase();
                return site.includes(filter.toLowerCase()) || user.includes(filter.toLowerCase());
            });
            
            count.textContent = passwords.length;
            
            if (filtered.length === 0) {
                empty.classList.remove('hidden');
                return;
            }
            empty.classList.add('hidden');
            
            filtered.forEach(p => {
                const site = decrypt(p.site);
                const user = decrypt(p.username);
                const pass = decrypt(p.password);
                const notes = decrypt(p.notes);
                
                const card = document.createElement('div');
                card.className = 'glass-card rounded-2xl p-5 relative group touch-feedback';
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold flex-shrink-0">
                                ${site.charAt(0).toUpperCase()}
                            </div>
                            <div class="min-w-0">
                                <h3 class="font-semibold text-lg truncate">${site}</h3>
                                <p class="text-sm text-gray-400 truncate">${user}</p>
                            </div>
                        </div>
                        <div class="flex gap-1 flex-shrink-0">
                            <button onclick="editPassword('${p.id}')" class="p-2 rounded-lg hover:bg-white/10 transition text-gray-400 hover:text-white touch-feedback">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onclick="deletePassword('${p.id}')" class="p-2 rounded-lg hover:bg-red-500/20 transition text-gray-400 hover:text-red-400 touch-feedback">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <div class="flex items-center justify-between p-3 rounded-lg bg-black/20">
                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                <svg class="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
                                <span class="password-field hidden-password font-mono text-sm truncate" data-pass="${pass}">••••••••••••</span>
                            </div>
                            <div class="flex gap-1 ml-2 flex-shrink-0">
                                <button onclick="toggleShowPassword(this)" class="p-1.5 rounded hover:bg-white/10 transition text-gray-400 hover:text-white touch-feedback">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                </button>
                                <button onclick="copyToClipboard('${pass}')" class="copy-btn p-1.5 rounded hover:bg-white/10 transition text-gray-400 hover:text-white touch-feedback">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                                </button>
                            </div>
                        </div>
                        ${notes ? `<p class="text-xs text-gray-500 mt-2 line-clamp-2">${notes}</p>` : ''}
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function searchPasswords() {
            const query = document.getElementById('searchInput').value;
            renderPasswords(query);
        }

        function showAddModal() {
            editingId = null;
            document.getElementById('modalTitle').textContent = 'Añadir Contraseña';
            document.getElementById('siteName').value = '';
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('notes').value = '';
            document.getElementById('passwordModal').classList.remove('hidden');
        }

        function editPassword(id) {
            const p = passwords.find(x => x.id === id);
            if (!p) return;
            
            editingId = id;
            document.getElementById('modalTitle').textContent = 'Editar Contraseña';
            document.getElementById('siteName').value = decrypt(p.site);
            document.getElementById('username').value = decrypt(p.username);
            document.getElementById('password').value = decrypt(p.password);
            document.getElementById('notes').value = decrypt(p.notes);
            document.getElementById('passwordModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('passwordModal').classList.add('hidden');
        }

        function savePassword() {
            const site = document.getElementById('siteName').value.trim();
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const notes = document.getElementById('notes').value.trim();
            
            if (!site || !password) {
                showToast('Sitio y contraseña son obligatorios', 'error');
                if (navigator.vibrate) navigator.vibrate(200);
                return;
            }
            
            const entry = {
                id: editingId || Date.now().toString(),
                site: encrypt(site),
                username: encrypt(username),
                password: encrypt(password),
                notes: encrypt(notes),
                created: editingId ? passwords.find(p => p.id === editingId).created : new Date().toISOString()
            };
            
            if (editingId) {
                const idx = passwords.findIndex(p => p.id === editingId);
                passwords[idx] = entry;
            } else {
                passwords.push(entry);
            }
            
            saveToStorage();
            renderPasswords();
            closeModal();
            showToast(editingId ? 'Contraseña actualizada' : 'Contraseña guardada', 'success');
            if (navigator.vibrate) navigator.vibrate(50);
        }

        function deletePassword(id) {
            if (!confirm('¿Eliminar esta contraseña permanentemente?')) return;
            passwords = passwords.filter(p => p.id !== id);
            saveToStorage();
            renderPasswords();
            showToast('Contraseña eliminada', 'success');
        }

        function toggleShowPassword(btn) {
            const container = btn.closest('.glass-card').querySelector('.password-field');
            const isHidden = container.classList.contains('hidden-password');
            
            if (isHidden) {
                container.classList.remove('hidden-password');
                container.textContent = container.dataset.pass;
                btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>`;
            } else {
                container.classList.add('hidden-password');
                container.textContent = '••••••••••••';
                btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
            }
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copiado al portapapeles', 'success');
                if (navigator.vibrate) navigator.vibrate(50);
            });
        }

        function showGenerator() {
            document.getElementById('generatorModal').classList.remove('hidden');
            generatePassword();
        }

        function closeGenerator() {
            document.getElementById('generatorModal').classList.add('hidden');
        }

        function updateLength(val) {
            document.getElementById('lengthValue').textContent = val;
        }

        function generatePassword() {
            const length = parseInt(document.getElementById('lengthSlider').value);
            const useUpper = document.getElementById('useUpper').checked;
            const useLower = document.getElementById('useLower').checked;
            const useNumbers = document.getElementById('useNumbers').checked;
            const useSymbols = document.getElementById('useSymbols').checked;
            
            let chars = '';
            if (useLower) chars += 'abcdefghijklmnopqrstuvwxyz';
            if (useUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            if (useNumbers) chars += '0123456789';
            if (useSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
            
            if (chars === '') {
                showToast('Selecciona al menos un tipo de carácter', 'error');
                return;
            }
            
            let password = '';
            const array = new Uint32Array(length);
            window.crypto.getRandomValues(array);
            
            for (let i = 0; i < length; i++) {
                password += chars[array[i] % chars.length];
            }
            
            document.getElementById('generatedPassword').textContent = password;
        }

        function generateAndFill() {
            generatePassword();
            const pass = document.getElementById('generatedPassword').textContent;
            document.getElementById('password').value = pass;
        }

        function copyGenerated() {
            const pass = document.getElementById('generatedPassword').textContent;
            if (pass !== 'Click generar') {
                navigator.clipboard.writeText(pass);
                showToast('Contraseña copiada', 'success');
            }
        }

        function togglePasswordVisibility(id) {
            const input = document.getElementById(id);
            input.type = input.type === 'password' ? 'text' : 'password';
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            
            const colors = {
                success: 'bg-green-500/20 border-green-500/30 text-green-300',
                error: 'bg-red-500/20 border-red-500/30 text-red-300',
                info: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
            };
            
            toast.className = `toast glass px-4 py-3 rounded-xl border ${colors[type]} flex items-center gap-2 min-w-[200px]`;
            toast.innerHTML = `<span class="text-sm font-medium">${message}</span>`;
            
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Cerrar modales al hacer click fuera
        window.onclick = function(event) {
            if (event.target.id === 'passwordModal') closeModal();
            if (event.target.id === 'generatorModal') closeGenerator();
        }

        // Prevenir zoom en inputs en iOS
        document.addEventListener('gesturestart', function (e) {
            e.preventDefault();
        });
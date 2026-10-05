function clean(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

export function normalizePublicLanguage(value) {
    return value === 'en' ? 'en' : 'ru';
}

export function normalizeRegistrationInput(body = {}) {
    return {
        name: clean(body.name, 80),
        email: clean(body.email, 254).toLowerCase(),
        country: '', city: '', location: '',
        language: normalizePublicLanguage(body.language), joinReason: '', currentTopic: ''
    };
}

export function validateRegistrationInput(input) {
    if (!input.name || !input.email) {
        return 'Имя или ник и e-mail обязательны. / Name or nickname and e-mail are required.';
    }
    if (!/^\S+@\S+\.\S+$/.test(input.email)) {
        return 'Укажите корректный e-mail. / Enter a valid e-mail address.';
    }
    return null;
}

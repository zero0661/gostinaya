const MAX_LENGTHS = {
    name: 80,
    email: 254,
    country: 80,
    city: 80,
    joinReason: 1000,
    currentTopic: 1000
};

function clean(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

export function normalizeRegistrationInput(body = {}) {
    const country = clean(body.country, MAX_LENGTHS.country);
    const city = clean(body.city, MAX_LENGTHS.city);

    return {
        name: clean(body.name, MAX_LENGTHS.name),
        email: clean(body.email, MAX_LENGTHS.email).toLowerCase(),
        password: String(body.password || ''),
        country,
        city,
        location: [city, country].filter(Boolean).join(', '),
        language: body.language === 'en'
            ? 'en'
            : body.language === 'ru'
                ? 'ru'
                : '',
        joinReason: clean(body.joinReason, MAX_LENGTHS.joinReason),
        currentTopic: clean(body.currentTopic, MAX_LENGTHS.currentTopic),
        acceptsRules: body.acceptsRules === true,
        acceptsPrivacy: body.acceptsPrivacy === true
    };
}

export function validateRegistrationInput(input) {
    if (!input.name || !input.email || !input.password) {
        return 'Имя, e-mail и пароль обязательны. / Name, e-mail and password are required.';
    }

    if (!/^\S+@\S+\.\S+$/.test(input.email)) {
        return 'Укажите корректный e-mail. / Enter a valid e-mail address.';
    }

    if (input.password.length < 8) {
        return 'Пароль должен содержать не менее 8 символов. / Password must contain at least 8 characters.';
    }

    if (!input.country || !input.city || !input.language) {
        return 'Укажите страну, город и язык общения. / Enter your country, city and language.';
    }

    if (!input.joinReason || !input.currentTopic) {
        return 'Ответьте на два вопроса перед входом. / Please answer both questions before entering.';
    }

    if (!input.acceptsRules || !input.acceptsPrivacy) {
        return 'Нужно принять Правила Гостиной и условия обработки данных. / Please accept the Lounge Rules and data processing terms.';
    }

    return null;
}

export function renderLoungeStatus(res, statusCode, options = {}) {
  const {
    title = 'Гостиная / The Lounge',
    headingRu = 'Что-то пошло не так',
    headingEn = 'Something went wrong',
    messageRu = 'Не удалось выполнить запрос.',
    messageEn = 'The request could not be completed.',
    backHref = '/gostinaya/hall',
    backLabelRu = 'Вернуться в Холл',
    backLabelEn = 'Back to Hall'
  } = options;

  return res.status(statusCode).render('errors/status', {
    title,
    statusCode,
    headingRu,
    headingEn,
    messageRu,
    messageEn,
    backHref,
    backLabelRu,
    backLabelEn
  });
}

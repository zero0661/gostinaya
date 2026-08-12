export function createArticleDiscussionRedirectHandler(repository) {
    if (!repository?.getByGhostPostId) {
        throw new TypeError(
            'Article discussion repository must provide getByGhostPostId'
        );
    }

    return async function articleDiscussionRedirect(req, res, next) {
        if (!req.session?.guest?.id) {
            return res.redirect('/gostinaya/login');
        }

        try {
            const discussion = await repository.getByGhostPostId(
                req.params.ghostPostId
            );

            if (!discussion) {
                return res.status(404).send(
                    'Обсуждение статьи не найдено / Article discussion not found'
                );
            }

            return res.redirect(
                `/gostinaya/topic/${discussion.topic_id}`
            );
        } catch (error) {
            return next(error);
        }
    };
}

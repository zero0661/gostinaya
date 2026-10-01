import { addReturnTo } from '../utils/authRedirect.js';

export function createArticleDiscussionRedirectHandler(repository, synchronizer = null) {
    if (!repository?.getByGhostPostId) {
        throw new TypeError(
            'Article discussion repository must provide getByGhostPostId'
        );
    }

    if (synchronizer && !synchronizer.syncPostById) {
        throw new TypeError(
            'Article discussion synchronizer must provide syncPostById'
        );
    }

    return async function articleDiscussionRedirect(req, res, next) {
        if (!req.session?.guest?.id) {
            return res.redirect(
                addReturnTo(
                    '/gostinaya/login',
                    `/gostinaya/article/${req.params.ghostPostId}`
                )
            );
        }

        try {
            let discussion = await repository.getByGhostPostId(
                req.params.ghostPostId
            );

            // A Ghost post.updated webhook can be delayed or missing. Repair the
            // RU/EN link even when an existing single-language topic was found.
            if (synchronizer && (!discussion || !discussion.ghost_post_id_ru ||
                !discussion.ghost_post_id_en || !discussion.url_ru || !discussion.url_en)) {
                try {
                    await synchronizer.syncPostById(req.params.ghostPostId);
                } catch (error) {
                    // A Ghost outage must not prevent opening an existing topic.
                    if (!discussion) throw error;
                    console.error('Could not repair article discussion:', error.message);
                }
                discussion = await repository.getByGhostPostId(
                    req.params.ghostPostId
                );
            }

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

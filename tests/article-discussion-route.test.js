import test from 'node:test';
import assert from 'node:assert/strict';
import { createArticleDiscussionRedirectHandler } from '../controllers/ArticleDiscussionController.js';

function responseRecorder() {
    return {
        statusCode: 200,
        redirectUrl: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        redirect(url) {
            this.redirectUrl = url;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        }
    };
}

test('article route redirects both language post ids to the linked topic', async () => {
    const repository = {
        async getByGhostPostId(id) {
            assert.match(id, /^(ru|en)-post$/);
            return { topic_id: 18 };
        }
    };
    const handler = createArticleDiscussionRedirectHandler(repository);

    for (const ghostPostId of ['ru-post', 'en-post']) {
        const response = responseRecorder();
        await handler(
            { params: { ghostPostId }, session: { guest: { id: 7 } } },
            response,
            assert.fail
        );
        assert.equal(response.redirectUrl, '/gostinaya/topic/18');
    }
});

test('article route requires login before looking up the discussion', async () => {
    let lookupCalled = false;
    const handler = createArticleDiscussionRedirectHandler({
        async getByGhostPostId() {
            lookupCalled = true;
        }
    });
    const response = responseRecorder();

    await handler(
        { params: { ghostPostId: 'ru-post' }, session: {} },
        response,
        assert.fail
    );

    assert.equal(
        response.redirectUrl,
        '/gostinaya/login?returnTo=%2Fgostinaya%2Farticle%2Fru-post'
    );
    assert.equal(lookupCalled, false);
});

test('article route repairs a missing RU/EN link before returning 404', async () => {
    let lookups = 0;
    let syncedPostId = null;
    const repository = {
        async getByGhostPostId() {
            lookups += 1;
            return lookups === 1 ? null : { topic_id: 35 };
        }
    };
    const synchronizer = {
        async syncPostById(postId) {
            syncedPostId = postId;
        }
    };
    const handler = createArticleDiscussionRedirectHandler(
        repository,
        synchronizer
    );
    const response = responseRecorder();

    await handler(
        { params: { ghostPostId: 'ru-post' }, session: { guest: { id: 7 } } },
        response,
        assert.fail
    );

    assert.equal(syncedPostId, 'ru-post');
    assert.equal(lookups, 2);
    assert.equal(response.redirectUrl, '/gostinaya/topic/35');
});

test('article route returns 404 when the post has no linked discussion', async () => {
    const handler = createArticleDiscussionRedirectHandler({
        async getByGhostPostId() {
            return null;
        }
    });
    const response = responseRecorder();

    await handler(
        { params: { ghostPostId: 'missing' }, session: { guest: { id: 7 } } },
        response,
        assert.fail
    );

    assert.equal(response.statusCode, 404);
    assert.match(response.body, /Article discussion not found/);
});

test('article route forwards repository errors to Express', async () => {
    const failure = new Error('database failed');
    const handler = createArticleDiscussionRedirectHandler({
        async getByGhostPostId() {
            throw failure;
        }
    });
    const response = responseRecorder();
    let forwarded;

    await handler(
        { params: { ghostPostId: 'ru-post' }, session: { guest: { id: 7 } } },
        response,
        error => {
            forwarded = error;
        }
    );

    assert.equal(forwarded, failure);
});

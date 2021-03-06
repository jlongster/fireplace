define('ratings',
    ['capabilities', 'l10n', 'utils', 'requests', 'notification', 'urls', 'z', 'templates'],
    function(capabilities, l10n, utils, requests, notification, urls, z, nunjucks) {
    'use strict';

    var gettext = l10n.gettext;

    // Initializes character counters for textareas.
    function initCharCount() {
        var countChars = function(el, cc) {
            var $el = $(el),
                val = $el.val(),
                max = parseInt(cc.attr('data-maxlength'), 10),
                left = max - val.length,
                cc_parent = cc.parent();
            // L10n: {0} is the number of characters left.
            cc.html(format(ngettext('<b>{0}</b> character left.',
                                    '<b>{0}</b> characters left.', left), [left]))
              .toggleClass('error', left < 0);
            if(left >= 0 && cc_parent.hasClass('error')) {
                cc_parent.removeClass('error');
            }
        };
        $('.char-count').each(function() {
            var $cc = $(this),
                $form = $(this).closest('form'),
                $el;
            if ($cc.attr('data-for-startswith') !== undefined) {
                $el = $('textarea[id^="' + $cc.attr('data-for-startswith') + '"]:visible', $form);
            } else {
                $el = $('textarea#' + $cc.attr('data-for'), $form);
            }
            $el.bind('keyup blur', _.throttle(function() {
                countChars(this, $cc);
            }, 250)).trigger('blur');
        });
    }

    function init() {
        z.page.on('loaded', function() {
            var flagOverlay = utils.makeOrGetOverlay('flag-review');

            // Hijack <select> with stars.
            $('select[name="rating"]').ratingwidget();

            initCharCount();

            // Show add review modal on app/app_slug/reviews/add for desktop.
            if ($('.reviews.add-review').length) {
                addOrEditYourReview($('#add-first-review'));
            }
        });

        // Returns the review body text or '' if the supplied element is not found.
        function getBody($body) {
            var body = $body.clone();
            // Get the inner *text* of the review body.
            body.find('br').replaceWith('\n');
            // `.text()` returns the unescaped text content, so re-escape it.
            return body.text().trim()
                       .replace(/&/g,'&amp;')
                       .replace(/</g,'&lt;')
                       .replace(/>/g,'&gt;');
        }

        function renderReviewTemplate(overlay, ctx) {
            overlay.html(
                    nunjucks.env.getTemplate('detail/review.html').render(ctx));
            overlay.find('select[name="rating"]').ratingwidget('large');
        }

        function handleReviewOverlay(overlay) {
            var $form = overlay.find('form');

            initCharCount();

            function validate() {
                var $error = overlay.find('.req-error'),
                    $comment = overlay.find('textarea'),
                    msg = $comment.val().strip(),
                    $parent = $comment.closest('.simple-field'),
                    $cc = overlay.find('.char-count'),
                    valid = !$cc.hasClass('error') && msg;
                if (valid) {
                    $parent.removeClass('error');
                    $error.remove();
                    overlay.off('submit.disable', 'form');
                } else {
                    if (!$parent.hasClass('error')) {
                        $parent.addClass('error');
                    }
                    if (!msg && !$error.length) {
                        $(format('<div class="error req-error">{0}</div>',
                                 gettext('This field is required.'))).insertBefore($cc);
                    }
                    overlay.on('submit.disable', 'form', false);
                }
                return valid;
            }

            overlay.addClass('show').trigger('overlayloaded');

            overlay.on('submit', 'form', function(e) {
                // Trigger validation.
                if (!validate(e)) {
                    e.preventDefault();
                    return false;
                }
                // Form submission is handled by POST hijacking.
            }).on('click', '.cancel', utils._pd(function() {
                overlay.removeClass('show');
            })).on('change.comment keyup.comment', 'textarea', _.throttle(validate, 250));
        }

        function flagReview(reviewEl) {
            var overlay = utils.makeOrGetOverlay('flag-review');
            overlay.addClass('show').trigger('overlayloaded');
            overlay.one('click', '.cancel', utils._pd(function() {
                overlay.removeClass('show');
            })).one('click', '.menu a', utils._pd(function(e) {
                var flag = $(e.target).attr('href').slice(1),
                    actionEl = reviewEl.find('.actions .flag');
                overlay.removeClass('show');
                actionEl.text(gettext('Sending report...'));
                $.ajax({
                    type: 'POST',
                    url: reviewEl.data('flag-url'),
                    data: {flag: flag},
                    success: function() {
                        actionEl.replaceWith(gettext('Flagged for review'));
                    },
                    error: function(){ },
                    dataType: 'json'
                });
            }));
        }

        function deleteReview(reviewEl, action) {
            reviewEl.addClass('deleting');
            requests.del(action);
            $('#add-first-review').text(gettext('Write a Review'));
            reviewEl.addClass('deleted');
            notification.notification({message: gettext('Your review was successfully deleted!')});
        }

        // Edit review on the review listing page.
        function editReview(reviewEl) {
            var overlay = utils.makeOrGetOverlay('edit-review'),
                rating = reviewEl.data('rating'),
                action = reviewEl.closest('[data-edit-url]').data('edit-url'),
                body = getBody(reviewEl.find('.body'));

            var ctx = _.extend({
                title: gettext('Edit Your Review'),
                action: action
            }, require('helpers'));

            renderReviewTemplate(overlay, ctx);
            overlay.find('textarea').text(body);
            overlay.find(format('.ratingwidget [value="{0}"]', rating)).click();

            handleReviewOverlay(overlay);
        }

        // This gets used when you're not editing a review on the review list page.
        function addOrEditYourReview($senderEl) {
            var overlay = utils.makeOrGetOverlay('edit-review'),
                rating = $senderEl.attr('data-rating'),
                title = gettext('Write a Review'),
                action = $senderEl.data('href');

            var ctx = _.extend({
                title: title,
                action: action
            }, require('helpers'));

            if (rating > 0) {
                title = gettext('Edit Your Review');

                requests.get(action, function(data) {
                    renderReviewTemplate(overlay, ctx);
                    var body = overlay.find('textarea').text(data.body);
                    overlay.find('textarea').text(getBody(body));
                    overlay.find(format('.ratingwidget [value="{0}"]', rating)).click();
                });
            } else {
                renderReviewTemplate(overlay, ctx);
            }
            initCharCount();
            handleReviewOverlay(overlay);
        }

        // Toggle rating breakdown (on listing page only, not detail page).
        z.page.on('click', '.average-rating-listing', utils._pd(function() {
            $('.grouped-ratings').toggle();
        })).on('click', '.grouped-ratings-listing', utils._pd(function() {
            $('.grouped-ratings').hide();
        }));

        // Cancel rating button.
        z.page.on('click', '.review .actions a, #add-first-review', utils._pd(function(e) {
            var $this = $(this);

            // data('action') only picks up once so we reference attr('data-action') since
            // it changes if a user edits a review
            var action = $this.attr('data-action');
            if (!action) return;
            var $review = $this.closest('.review');
            switch (action) {
                case 'delete':
                    deleteReview($review, $this.attr('data-href'));
                    break;
                case 'edit':
                    editReview($review);
                    break;
                case 'add-or-edit':
                    addOrEditYourReview($this);
                    break;
                case 'report':
                    flagReview($review);
                    break;
            }
        }));

        z.body.on('submit', '.friendly', utils._pd(function(e) {
            var $this = $(this);
            var overlay = utils.makeOrGetOverlay('edit-review');

            requests.post(urls.api.url('reviews'), $this.serialize(), function() {
                console.log('submitted review');
                $('#add-first-review').text(gettext('Edit Your Review'))
                                      .attr('data-rating', $this.find('input[type=radio]:checked').val());
                $this.find('textarea, #id_rating').val('');
                overlay.removeClass('show');
                notification.notification({message: gettext('Review successfully posted!')});
            });
        }));
    }

    return {init: init};
});

/**
 * Turn a title into a URL-safe slug.
 * e.g. "K-Nearest Neighbors!" -> "k-nearest-neighbors"
 */
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // drop punctuation
        .replace(/[\s_]+/g, '-') // spaces/underscores -> hyphen
        .replace(/-+/g, '-') // collapse repeats
        .replace(/^-|-$/g, ''); // trim leading/trailing hyphens
}

/**
 * Generate a slug from `base` that is unique for the given Mongoose model,
 * appending -2, -3, ... on collisions.
 */
async function generateUniqueSlug(Model, base) {
    const root = base || 'item';
    let slug = root;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await Model.exists({ slug })) {
        n += 1;
        slug = `${root}-${n}`;
    }
    return slug;
}

module.exports = { slugify, generateUniqueSlug };

/**
 * Regex to match LeetCode problem URLs.
 * Matches:
 *   - https://leetcode.com/problems/two-sum/
 *   - https://www.leetcode.com/problems/two-sum/description/
 *   - leetcode.com/problems/add-two-numbers
 */
const LEETCODE_PROBLEM_REGEX =
  /(?:https?:\/\/)?(?:www\.)?leetcode\.com\/problems\/([a-z0-9-]+)\/?(?:[a-z]*\/?)?/gi;

/**
 * Converts a problem slug to a readable title.
 * @param {string} slug - e.g., "two-sum"
 * @returns {string} - e.g., "Two Sum"
 */
export function slugToTitle(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Verifies that a LeetCode problem slug corresponds to a real problem.
 * Uses LeetCode's public GraphQL API.
 * @param {string} slug - e.g., "two-sum"
 * @returns {Promise<boolean>} - true if the problem exists
 */
export async function verifyLeetCodeProblem(slug) {
  try {
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query getQuestionDetail($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            titleSlug
          }
        }`,
        variables: { titleSlug: slug },
      }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data?.data?.question != null;
  } catch {
    // If the API is unreachable, allow the submission through
    return true;
  }
}

/**
 * Extracts LeetCode problems from message content.
 * @param {string} content - Message text
 * @returns {Array<{url: string, slug: string, title: string}>}
 */
export function extractLeetCodeProblems(content) {
  const problems = [];
  const seen = new Set();

  // Reset regex state
  LEETCODE_PROBLEM_REGEX.lastIndex = 0;

  let match;
  while ((match = LEETCODE_PROBLEM_REGEX.exec(content)) !== null) {
    const slug = match[1];

    if (!seen.has(slug)) {
      seen.add(slug);
      problems.push({
        url: `https://leetcode.com/problems/${slug}/`,
        slug,
        title: slugToTitle(slug),
      });
    }
  }

  return problems;
}

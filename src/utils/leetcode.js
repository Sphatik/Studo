/**
 * Regex to match LeetCode problem URLs.
 * Matches:
 *   - https://leetcode.com/problems/two-sum/
 *   - https://www.leetcode.com/problems/two-sum/description/
 *   - leetcode.com/problems/add-two-numbers
 */
const LEETCODE_PROBLEM_REGEX = /(?:https?:\/\/)?(?:www\.)?leetcode\.com\/problems\/([a-z0-9-]+)\/?(?:[a-z]*\/?)?/gi;

/**
 * Regex to match GeeksForGeeks problem URLs.
 * Matches:
 *   - https://www.geeksforgeeks.org/problems/detect-cycle-in-an-undirected-graph/1
 *   - geeksforgeeks.org/problems/two-sum/0
 */
const GFG_PROBLEM_REGEX = /(?:https?:\/\/)?(?:www\.)?geeksforgeeks\.org\/problems\/([a-z0-9-]+)\/?/gi;

/**
 * Regex to match NeetCode problem URLs.
 * Matches:
 *   - https://neetcode.io/problems/minimum-stack/question?list=neetcode150
 *   - neetcode.io/problems/two-sum
 */
const NEETCODE_PROBLEM_REGEX = /(?:https?:\/\/)?(?:www\.)?neetcode\.io\/problems\/([a-z0-9-]+)\/?/gi;

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
 * Extracts LeetCode, GFG, and NeetCode problems from message content.
 * @param {string} content - Message text
 * @returns {Array<{url: string, slug: string, title: string, source: string}>}
 */
export function extractLeetCodeProblems(content) {
  const problems = [];
  const seen = new Set();

  const sources = [
    {
      regex: LEETCODE_PROBLEM_REGEX,
      source: 'leetcode',
      buildUrl: slug => `https://leetcode.com/problems/${slug}/`,
    },
    {
      regex: GFG_PROBLEM_REGEX,
      source: 'gfg',
      buildUrl: slug => `https://www.geeksforgeeks.org/problems/${slug}/`,
    },
    {
      regex: NEETCODE_PROBLEM_REGEX,
      source: 'neetcode',
      buildUrl: slug => `https://neetcode.io/problems/${slug}/`,
    },
  ];

  for (const { regex, source, buildUrl } of sources) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const slug = match[1];
      const key = `${source}:${slug}`;
      if (!seen.has(key)) {
        seen.add(key);
        problems.push({
          url: buildUrl(slug),
          slug,
          title: slugToTitle(slug),
          source,
        });
      }
    }
  }

  return problems;
}

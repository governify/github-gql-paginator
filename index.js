const { GQLPaginator } = require('./src/GQLPaginatorService.js');
const dotenv = require('dotenv');

dotenv.config();

module.exports = { GQLPaginator };

const zenhubToken = process.env.ZH_TOKEN
const githubToken = process.env.GH_TOKEN
const execTest = true;

async function fetchData() {
  try {
    const result = await GQLPaginator(null, githubToken, 'SQP-githubProjectQueries-inProgressIssuesPaginator', {repository: "psg2-2223-g6-63", owner: "gii-is-psg2"})

    /*const result = await GQLPaginator(`{
      repository(name: "psg2-2223-g6-63", owner:"gii-is-psg2") {
        issues(first: 25) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
          }
        }
        pullRequests(first: 10, states: MERGED) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            state
            title
            body
            baseRefName
            headRefName
            createdAt
            author {
              login
            }
            mergedAt
            mergedBy {
              login
            }
            reviews(first: 1) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                createdAt
                state
                reactions (first: 1) {
                  totalCount
                  pageInfo {
                    hasNextPage
                    endCursor 
                  }
                  nodes {
                    content
                    id
                    user{
                      name
                    }
                  }
                }
              }
            }
            assignees(first: 1){
              pageInfo {
                hasNextPage
                endCursor
              }
              totalCount
              nodes{
                id
                name
              }
            }
          }
        }
      }
    }
  `, githubToken, 'github-v1.0.0', null);*/

    console.log(result);
  } catch (error) {
    console.error('Error:', error);
  }
}

if(execTest)
  fetchData();
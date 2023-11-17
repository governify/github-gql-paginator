import axios from 'axios';
import fs from 'fs';
import { graphQlQueryToJson } from 'graphql-query-to-json'; // npm install graphql-query-to-json
import { jsonToGraphQLQuery } from 'json-to-graphql-query'; // npm install json-to-graphql-query
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

  // Public function --------------------------------------------------------------------------------------------------
  export async function GQLPaginator(query, token, apiVersionConfig){ //import { GQLPaginator, visualizeAllAvailableConfigurationsSource } from 'github-gql-paginator';
    tokenPred = token;
    originalQuery = query;
    const configPath = path.resolve(__dirname, `../configurations/sources/${apiVersionConfig}.json`);

    try {
      jsonConfigApiData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      throw new Error(`Non-existing API version configuration`);
    }

    const result = await requestQuery(query);

    if(originalQuery.includes('"id"') && originalQuery.includes('"totalCount"') && originalQuery.includes('"hasNextPage"') && originalQuery.includes('"pageInfo"') && !originalQuery.includes('"after"')){
      console.log("Returning query result without paginating because the query doesn't contain the elements required for pagination.")
      return JSON.parse(result);
    }

    return await pagination(JSON.parse(result));
  }


  // Auxiliar function --------------------------------------------------------------------------------------------------
  async function pagination(result) {    
    try {

      const properties = []
      for (const property in result) { // Collect all keys from the result
        properties.push(property);
      }

      firstPath = properties[0];
      await resolvePtypePagesRecursive(result, firstPath);

      const finalResultJSON = JSON.stringify(result, null, 2);
    
      fs.writeFile('finalResult.json', finalResultJSON, (err) => {
        if (err) {
          console.error('Error writing JSON file:', err);
        } else {
          console.log(`The finalResult.json file has been created with the generated result.`);
        }
      }); //Generate a file with the result

      console.log("Pagination done correctly.")
      return result;
    } catch (error) {
      const originalResult = JSON.parse(await requestQuery(originalQuery));

      const finalResultJSON = JSON.stringify(originalResult, null, 2);

      
      fs.writeFile('finalResult.json', finalResultJSON, (err) => {
        if (err) {
          console.error('Error writing JSON file:', err);
        } else {
          console.log(`The finalResult.json file has been created with the generated result..`);
        }
      }); ////Generate a file with the result

      console.error("Error performing pagination:", error);
      console.log("Returning query result without paginating due to error.")
      return originalResult;
    }
  }




  // Global variables -----------------------------------------------------------------------------------------------------  
  var originalQuery = "";

  var tokenPred = "";

  var ptypePath = [];

  var lastVisitedIdByPtype = {};

  var firstPath = "";

  var jsonConfigApiData;

  // Recursive function --------------------------------------------------------------------------------------------------
  async function resolvePtypePagesRecursive(currentResult, rootAttribute) {
      
    const properties = []
    for (const property in currentResult) { // Collect all keys from the result
      if(property!=="pageInfo" && property!=="totalCount" && typeof currentResult[property]!=="string" || property=="id")
        properties.push(property);
    }

    if(properties.includes("id")){ // Stores the last ids of each pageable type that has been visited
      lastVisitedIdByPtype[ptypePath[ptypePath.length-1]] = currentResult.id;
    }
    
    if(properties.length == 0){ // Base case
      return;
    }

    if(properties.includes("nodes")){ // Check if pagination can be performed
      if(!ptypePath.includes(rootAttribute)) ptypePath.push(rootAttribute) // Stores the path to follow when finding a pageable type
      const nodesHasMorePages = currentResult?.pageInfo?.hasNextPage;
      const totalCountExist = currentResult.hasOwnProperty("totalCount");
      const endCursorExist = currentResult.pageInfo?.hasOwnProperty("endCursor");
      const nodesHasIdProperty = currentResult.nodes?.[0]?.hasOwnProperty("id");
      if( nodesHasMorePages && totalCountExist && endCursorExist && nodesHasIdProperty){
        const cursor = currentResult.pageInfo.endCursor;
        const ghostNodes = await getAllGhostNodes(cursor); // Solve pagination
        currentResult.nodes.push(...ghostNodes);
      }
    }
    
    if(properties.includes("nodes")){ // Loop through all nodes when we find a pageable type
      for(const node of currentResult.nodes){
        var subResult = node;
        await resolvePtypePagesRecursive(subResult, "nodes");
      }
      ptypePath.pop(); // Delete the last element of the path because we have already gone through all the nodes and we are already going back
      return;
    }

    // Browse all found properties
    for(const property of properties){
      if(currentResult.hasOwnProperty(property)){
        var subResult = currentResult[property];
        await resolvePtypePagesRecursive(subResult, property);
      }
    }
    return;
  }
  

  // Ghost Nodes --------------------------------------------------------------------------------------------------
  async function getAllGhostNodes(cursorOfNextPage){
    var hasNextPage = true;
    var finalGhostNodes = [];

    var originalQueryObj = graphQlQueryToJson(originalQuery) // Used inside an eval()

    const firstLevelPtype = ptypePath.length == 1;

    if(firstLevelPtype){
      var getNextPageQuery = originalQuery.replace(new RegExp(`${ptypePath[0]}\\(`, 'g'), `${ptypePath[0]}(after: "#NEWCURSOR#", `);
      while(hasNextPage){

        var nextPageResult = await requestQuery(getNextPageQuery.replace(/#NEWCURSOR#/g, cursorOfNextPage))

        var nextPageResultJSON = JSON.parse(nextPageResult);

        var newGhostNodes = nextPageResultJSON[firstPath][ptypePath[ptypePath.length-1]].nodes;

        if(nextPageResultJSON[firstPath][ptypePath[0]].pageInfo.hasNextPage){
          cursorOfNextPage = nextPageResultJSON[firstPath][ptypePath[0]].pageInfo.endCursor;
        } else{
            hasNextPage = false;
        }

        finalGhostNodes.push(...newGhostNodes);
        
      }
    } else if(!firstLevelPtype){
      while(hasNextPage){

        var ptypePathString = generateRequiredPath();

        var nodeId = lastVisitedIdByPtype[ptypePath[ptypePath.length-2]] // Second to last pageable type of the path

        var pathIncludingNodes = ptypePath.map(element => `${element}.nodes`).join(".")
        var nodesProperties = jsonToGraphQLQuery(eval("originalQueryObj.query." + firstPath +"."+pathIncludingNodes), { pretty: true });

        var getNextPageQuery =     
        `query Get${ptypePathString}ById {
          node(id: \"${nodeId}\") { 
            ... on ${ptypePathString} {
              id
              ${ptypePath[ptypePath.length-1]}(first: 1, after: \"${cursorOfNextPage}\"){
                pageInfo {
                  hasNextPage
                  endCursor
                }
                totalCount
                nodes{
                  ${nodesProperties}
                }
              }
            }
          }
        }`

        var nextPageResult = await requestQuery(getNextPageQuery);

        var nextPageResultJSON = JSON.parse(nextPageResult);

        var newGhostNodes = nextPageResultJSON.node[ptypePath[ptypePath.length-1]].nodes;

        if(nextPageResultJSON.node[ptypePath[ptypePath.length-1]].pageInfo.hasNextPage){
          cursorOfNextPage = nextPageResultJSON.node[ptypePath[ptypePath.length-1]].pageInfo.endCursor;
        } else{
          hasNextPage = false;
        }

        finalGhostNodes.push(...newGhostNodes);

      }
    }
    return finalGhostNodes;
  }


  // Generate path for new query --------------------------------------------------------------------------------------------------
  function generateRequiredPath(){
    var ptypePathString = "";
    var ptypePathSearcher = "";

    if(jsonConfigApiData.complexSubqueryPath){
      var lastIndex = -1;
      for (var i = 0; i < ptypePath.length; i++) {
        if (jsonConfigApiData.firstLevelPtype.includes(ptypePath[i])) {
          lastIndex = i;
        }
      }
      const subList = ptypePath.slice(lastIndex);

      ptypePathSearcher = (subList.slice(0, -1).join('.')) + '.*';
    } else {
      ptypePathSearcher = "*." + ptypePath[ptypePath.length - 2] + ".*";
    }

    ptypePathString = jsonConfigApiData.paths[ptypePathSearcher];      

    if (ptypePathString === undefined) {
      throw new Error(`Error finding path ${ptypePathSearcher} in ${jsonConfigApiData.id}.json file. Add the path in paths to be able to paginate`);
    }

    return ptypePathString;
  }
  
  
  //  Request GQL query --------------------------------------------------------------------------------------------------
  async function requestQuery(query) {
    const apiUrl = jsonConfigApiData.url;
    const requestConfig = {
      headers: {
        Authorization: `Bearer ${tokenPred}`,
        Accept: 'application/json',
      },
    };
    try {
      const result = await axios.post(apiUrl, { query }, requestConfig);

      if (result.status === 200) {
        const responseData = result.data.data;

        if (!responseData) {
          throw new Error(`Error in the api request (${jsonConfigApiData.url}): Repository not found`);
        }

        const repositoryJSON = JSON.stringify(responseData);

        return repositoryJSON;
      } else {
        throw new Error(`Error in the api request (${jsonConfigApiData.url}): ${result.status}`);
      }
    } catch (error) {
      throw new Error(`Error in the api request (${jsonConfigApiData.url}): your query, apiUrl or token are wrong`);
    }
  }
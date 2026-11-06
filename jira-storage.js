import {validateJiraFilters} from './jira-model.js';

// Separate from measurement-builder JSON imports and report snapshots. Persist
// only applied filters; Jira counts and issue details are retrieved again.
export const JIRA_FILTER_STORAGE='measure-jira-filters-v1';
export function readJiraFilters(storage){
  const raw=storage?.getItem(JIRA_FILTER_STORAGE);
  if(!raw)return null;
  const saved=JSON.parse(raw);
  if(saved?.version!==1||!saved.filters||typeof saved.filters!=='object'||Array.isArray(saved.filters))throw new Error('Invalid saved Jira filters.');
  return validateJiraFilters(saved.filters);
}
export function saveJiraFilters(storage,input){
  const filters=validateJiraFilters(input);
  if(!storage)throw new Error('Browser storage is unavailable.');
  storage.setItem(JIRA_FILTER_STORAGE,JSON.stringify({version:1,filters}));
}

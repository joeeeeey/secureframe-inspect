const {test}=require('node:test');const assert=require('node:assert/strict');const {graphqlRead,decide}=require('./policy.cjs');
test('queries only, including shorthand and fragments',()=>{
 assert.equal(graphqlRead({query:'{ viewer { id } }'}).operation_type,'query');
 assert.equal(graphqlRead({query:'query Q { viewer { ...F } } fragment F on User { id }'}).operation_type,'query');
});
test('reject mutation, subscription, persisted and mixed batches',()=>{
 for(const body of [{query:'mutation { deleteUser(id:"private") { id } }'},{query:'subscription { event }'},{extensions:{persistedQuery:{}}},[{query:'query { viewer { id } }'},{query:'mutation { x }'}],{query:'query Q { viewer { id } } mutation M { x }',operationName:'Q'}])assert.equal(graphqlRead(body),null);
});
test('capture omits variable values, aliases, operation names, querystrings and bodies',()=>{
 const d=decide({url:'https://app.secureframe.com/graphql?token=hidden',method:'POST',resourceType:'fetch',body:JSON.stringify({operationName:'PrivatePerson',query:'query PrivatePerson($email:String!) { PrivateAlias:users(email:$email) { id } }',variables:{email:'private@example.com'}})});
 assert.equal(d.allow,true);const s=JSON.stringify(d);for(const value of ['PrivatePerson','PrivateAlias','private@example.com','hidden'])assert.ok(!s.includes(value));
});
test('block unknown writes and GET APIs',()=>{
 for(const method of ['GET','POST','PUT','DELETE'])assert.equal(decide({url:'https://app.secureframe.com/api/unknown',method,resourceType:'fetch'}).allow,false);
});
test('GraphQL GET cannot bypass policy',()=>{
 assert.equal(decide({url:'https://app.secureframe.com/graphql?query=mutation%20%7B%20x%20%7D',method:'GET',resourceType:'fetch'}).allow,false);
});

test('resource type cannot turn an unknown endpoint into an allowed asset',()=>{
 for(const url of ['https://app.secureframe.com/api/unknown?private=synthetic','https://collector.example/pixel.png','https://app.secureframe.com/assets/../../api/unknown.png']) {
  for(const resourceType of ['image','script','stylesheet','font']) assert.equal(decide({url,method:'GET',resourceType}).allow,false);
 }
 assert.equal(decide({url:'https://app.secureframe.com/assets/app.js',method:'GET',resourceType:'script'}).allow,true);
});

type Programs=Record<string,Record<string,[string,string]>>;
export const editionFixtures:Programs={};
function scalar(slug:string,name:string,jsArgs:string,tsArgs:string,pythonArgs:string,javaArgs:string,cppArgs:string,cArgs:string,bodies:Record<string,string>){
  editionFixtures[slug]={
    javascript:[`function ${name}(${jsArgs}){${bodies.javascript}}`,`function ${name}(${jsArgs}){return 0;}`],
    typescript:[`function ${name}(${tsArgs}):number{${bodies.javascript}}`,`function ${name}(${tsArgs}):number{return 0;}`],
    python:[`class Solution:\n    def ${name}(self,${pythonArgs}):\n${bodies.python}\n`,`class Solution:\n    def ${name}(self,${pythonArgs}):\n        return 0\n`],
    java:[`class Solution{public int ${name}(${javaArgs}){${bodies.java}}}`,`class Solution{public int ${name}(${javaArgs}){return 0;}}`],
    cpp:[`class Solution{public:int ${name}(${cppArgs}){${bodies.cpp}}};`,`class Solution{public:int ${name}(${cppArgs}){return 0;}};`],
    c:[`int ${name}(${cArgs}){${bodies.c}}`,`int ${name}(${cArgs}){return 0;}`],
  };
}
scalar('count-above','countAbove','values,threshold','values:number[],threshold:number','values,threshold','int[] values,int threshold','vector<int>&values,int threshold','int*values,int valuesSize,int threshold',{
  javascript:'let n=0;for(const v of values)if(v>threshold)n++;return n;',python:'        return sum(v>threshold for v in values)',java:'int n=0;for(int v:values)if(v>threshold)n++;return n;',cpp:'int n=0;for(int v:values)if(v>threshold)n++;return n;',c:'int n=0;for(int i=0;i<valuesSize;i++)if(values[i]>threshold)n++;return n;'
});
scalar('first-decrease','firstDecrease','values','values:number[]','values','int[] values','vector<int>&values','int*values,int valuesSize',{
  javascript:'for(let i=1;i<values.length;i++)if(values[i]<values[i-1])return i;return -1;',python:'        for i in range(1,len(values)):\n            if values[i]<values[i-1]: return i\n        return -1',java:'for(int i=1;i<values.length;i++)if(values[i]<values[i-1])return i;return -1;',cpp:'for(int i=1;i<(int)values.size();i++)if(values[i]<values[i-1])return i;return -1;',c:'for(int i=1;i<valuesSize;i++)if(values[i]<values[i-1])return i;return -1;'
});
scalar('longest-level-run','longestRun','values','values:number[]','values','int[] values','vector<int>&values','int*values,int valuesSize',{
  javascript:'let best=0,run=0;for(let i=0;i<values.length;i++){run=i&&values[i]===values[i-1]?run+1:1;best=Math.max(best,run);}return best;',python:'        best=run=0\n        for i,v in enumerate(values):\n            run=run+1 if i and v==values[i-1] else 1\n            best=max(best,run)\n        return best',java:'int best=0,run=0;for(int i=0;i<values.length;i++){run=i>0&&values[i]==values[i-1]?run+1:1;best=Math.max(best,run);}return best;',cpp:'int best=0,run=0;for(int i=0;i<(int)values.size();i++){run=i>0&&values[i]==values[i-1]?run+1:1;best=max(best,run);}return best;',c:'int best=0,run=0;for(int i=0;i<valuesSize;i++){run=i>0&&values[i]==values[i-1]?run+1:1;if(run>best)best=run;}return best;'
});
scalar('strongest-window','strongestWindow','values,width','values:number[],width:number','values,width','int[] values,int width','vector<int>&values,int width','int*values,int valuesSize,int width',{
  javascript:'let sum=0;for(let i=0;i<width;i++)sum+=values[i];let best=sum;for(let i=width;i<values.length;i++){sum+=values[i]-values[i-width];best=Math.max(best,sum);}return best;',python:'        current=sum(values[:width])\n        best=current\n        for i in range(width,len(values)):\n            current+=values[i]-values[i-width]\n            best=max(best,current)\n        return best',java:'int sum=0;for(int i=0;i<width;i++)sum+=values[i];int best=sum;for(int i=width;i<values.length;i++){sum+=values[i]-values[i-width];best=Math.max(best,sum);}return best;',cpp:'int sum=0;for(int i=0;i<width;i++)sum+=values[i];int best=sum;for(int i=width;i<(int)values.size();i++){sum+=values[i]-values[i-width];best=max(best,sum);}return best;',c:'int sum=0;for(int i=0;i<width;i++)sum+=values[i];int best=sum;for(int i=width;i<valuesSize;i++){sum+=values[i]-values[i-width];if(sum>best)best=sum;}return best;'
});
scalar('letter-transitions','transitions','text','text:string','text','String text','string text','char*text',{
  javascript:'let n=0;for(let i=1;i<text.length;i++)if(text[i]!==text[i-1])n++;return n;',python:'        return sum(text[i]!=text[i-1] for i in range(1,len(text)))',java:'int n=0;for(int i=1;i<text.length();i++)if(text.charAt(i)!=text.charAt(i-1))n++;return n;',cpp:'int n=0;for(int i=1;i<(int)text.size();i++)if(text[i]!=text[i-1])n++;return n;',c:'int n=0;for(int i=1;text[i-1]&&text[i];i++)if(text[i]!=text[i-1])n++;return n;'
});
scalar('shared-prefix-length','sharedPrefixLength','left,right','left:string,right:string','left,right','String left,String right','string left,string right','char*left,char*right',{
  javascript:'let i=0;while(i<left.length&&i<right.length&&left[i]===right[i])i++;return i;',python:'        i=0\n        while i<len(left) and i<len(right) and left[i]==right[i]: i+=1\n        return i',java:'int i=0;while(i<left.length()&&i<right.length()&&left.charAt(i)==right.charAt(i))i++;return i;',cpp:'int i=0;while(i<(int)left.size()&&i<(int)right.size()&&left[i]==right[i])i++;return i;',c:'int i=0;while(left[i]&&right[i]&&left[i]==right[i])i++;return i;'
});
editionFixtures['drop-matching-links']={
  javascript:['function dropMatching(head,value){while(head&&head.val===value)head=head.next;let p=head;while(p&&p.next){if(p.next.val===value)p.next=p.next.next;else p=p.next;}return head;}','function dropMatching(head,value){return null;}'],
  typescript:['function dropMatching(head:ListNode|null,value:number):ListNode|null{while(head&&head.val===value)head=head.next;let p=head;while(p&&p.next){if(p.next.val===value)p.next=p.next.next;else p=p.next;}return head;}','function dropMatching(head:ListNode|null,value:number):ListNode|null{return null;}'],
  python:['class Solution:\n    def dropMatching(self,head,value):\n        while head and head.val==value: head=head.next\n        p=head\n        while p and p.next:\n            if p.next.val==value: p.next=p.next.next\n            else: p=p.next\n        return head\n','class Solution:\n    def dropMatching(self,head,value):\n        return None\n'],
  java:['class Solution{public ListNode dropMatching(ListNode head,int value){while(head!=null&&head.val==value)head=head.next;ListNode p=head;while(p!=null&&p.next!=null){if(p.next.val==value)p.next=p.next.next;else p=p.next;}return head;}}','class Solution{public ListNode dropMatching(ListNode head,int value){return null;}}'],
  cpp:['class Solution{public:ListNode*dropMatching(ListNode*head,int value){while(head&&head->val==value)head=head->next;ListNode*p=head;while(p&&p->next){if(p->next->val==value)p->next=p->next->next;else p=p->next;}return head;}};','class Solution{public:ListNode*dropMatching(ListNode*head,int value){return nullptr;}};'],
  c:['ListNode*dropMatching(ListNode*head,int value){while(head&&head->val==value)head=head->next;ListNode*p=head;while(p&&p->next){if(p->next->val==value)p->next=p->next->next;else p=p->next;}return head;}','ListNode*dropMatching(ListNode*head,int value){return NULL;}'],
};
editionFixtures['clip-tree-leaves']={
  javascript:['function clipLeaves(root){if(!root||(!root.left&&!root.right))return null;root.left=clipLeaves(root.left);root.right=clipLeaves(root.right);return root;}','function clipLeaves(root){return null;}'],
  typescript:['function clipLeaves(root:TreeNode|null):TreeNode|null{if(!root||(!root.left&&!root.right))return null;root.left=clipLeaves(root.left);root.right=clipLeaves(root.right);return root;}','function clipLeaves(root:TreeNode|null):TreeNode|null{return null;}'],
  python:['class Solution:\n    def clipLeaves(self,root):\n        if not root or (not root.left and not root.right): return None\n        root.left=self.clipLeaves(root.left)\n        root.right=self.clipLeaves(root.right)\n        return root\n','class Solution:\n    def clipLeaves(self,root):\n        return None\n'],
  java:['class Solution{public TreeNode clipLeaves(TreeNode root){if(root==null||(root.left==null&&root.right==null))return null;root.left=clipLeaves(root.left);root.right=clipLeaves(root.right);return root;}}','class Solution{public TreeNode clipLeaves(TreeNode root){return null;}}'],
  cpp:['class Solution{public:TreeNode*clipLeaves(TreeNode*root){if(!root||(!root->left&&!root->right))return nullptr;root->left=clipLeaves(root->left);root->right=clipLeaves(root->right);return root;}};','class Solution{public:TreeNode*clipLeaves(TreeNode*root){return nullptr;}};'],
  c:['TreeNode*clipLeaves(TreeNode*root){if(!root||(!root->left&&!root->right))return NULL;root->left=clipLeaves(root->left);root->right=clipLeaves(root->right);return root;}','TreeNode*clipLeaves(TreeNode*root){return NULL;}'],
};

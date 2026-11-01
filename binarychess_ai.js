/* COM player for 7 dimensional binary chess (alpha-beta minimax).
  A place is a 7 bit integer (a vertex of the 7-cube).
  A piece moves by flipping bits of its place:
    ROOK   : 1 bit
    BISHOP : 2 bits
    KING   : 1, 2 or 3 bits
  A piece captures the opponent piece on its destination.
  The player who captures the opponent KING wins.
*/
var AI_DIMS      = 7;
var AI_PLACES    = 1<<AI_DIMS;
var AI_MAX_DEPTH = 16;   // max number of plies to search
var AI_MAX_PLY   = 64;   // max ply including the capture search
var AI_QDEPTH    = 4;    // max number of plies of the capture search
var AI_MAX_MOVES = 512;  // max number of moves of one side
var AI_TIME_MS   = 1000; // deeper search is not started/continued after this time
var AI_WIN       = 1e6;  // score of a won game
var AI_KIND_K = 0, AI_KIND_B = 1, AI_KIND_R = 2;
var AI_VALUE  = [AI_WIN, 300, 100]; // material value of KING, BISHOP, ROOK
var AI_NEAR   = [0, 4, 3];          // bonus per step closer to the opponent KING
var AI_ORDER_CAPTURE = 1<<28;       // move ordering: captures
var AI_ORDER_KILLER  = 1<<27;       // move ordering: killer moves
var AI_PRESS  = 2; // bonus per place next to the opponent KING that is attacked
/* upper bound of the score change by a quiet move of a non-KING piece:
  a BISHOP gets 2 steps closer to the opponent KING (2*AI_NEAR[B]=8)
  and attacks 21 more places next to the opponent KING (21*AI_PRESS) */
var AI_FUTILITY = 8+21*AI_PRESS+2;

// monotonic clock in ms (Date.now() can jump when the system clock is adjusted)
var aiNow=function(){ return performance.now(); };

// number of 1 bits of each place
var AI_POPCOUNT=new Int8Array(AI_PLACES);
for(var x=0;x<AI_PLACES;x++){
  var c=0;
  for(var d=0;d<AI_DIMS;d++) c+=x>>d&1;
  AI_POPCOUNT[x]=c;
}
// AI_MASKS[k] = list of bit masks to flip for kind k
var AI_MASKS=[[],[],[]];
for(var f=1;f<AI_PLACES;f++){
  var n=AI_POPCOUNT[f];
  if(n<=3) AI_MASKS[AI_KIND_K].push(f);
  if(n==2) AI_MASKS[AI_KIND_B].push(f);
  if(n==1) AI_MASKS[AI_KIND_R].push(f);
}

//-------------------------------------------
/* board: state.board[p][k][i] = place of piece i of kind k of player p
  (the same format as binarychess.js)
  A move is encoded as id*AI_PLACES+to (id = piece index, to = destination). */
var AIBoard=function(board){
  this.n=0;
  this.px=new Int16Array(64);  // px[id] = place of piece id
  this.pk=new Int8Array(64);   // pk[id] = kind
  this.pp=new Int8Array(64);   // pp[id] = player
  this.pi=new Int16Array(64);  // pi[id] = index in state.board[p][k]
  this.alive=new Int8Array(64);
  this.sq=new Int16Array(AI_PLACES).fill(-1); // sq[x] = id of the piece on x, or -1
  this.ids=[[],[]];            // ids[p] = list of ids of player p
  this.king=[-1,-1];           // king[p] = id of the king of p
  for(var p=0;p<2;p++){
    for(var k=0;k<board[p].length;k++){
      for(var i=0;i<board[p][k].length;i++){
        var id=this.n++;
        this.px[id]=board[p][k][i]; this.pk[id]=k; this.pp[id]=p; this.pi[id]=i;
        this.alive[id]=1;
        this.sq[board[p][k][i]]=id;
        this.ids[p].push(id);
        if(k==AI_KIND_K) this.king[p]=id;
      }
    }
  }
  this.hFrom=new Int16Array(AI_MAX_PLY+1); // undo stack
  this.hCap =new Int16Array(AI_MAX_PLY+1);
  this.hId  =new Int16Array(AI_MAX_PLY+1);
  this.hTop =0;
  this.mbuf=[]; this.obuf=[];              // move lists and ordering values per ply
  for(var ply=0;ply<=AI_MAX_PLY;ply++){
    this.mbuf.push(new Int32Array(AI_MAX_MOVES));
    this.obuf.push(new Int32Array(AI_MAX_MOVES));
  }
  this.history=new Int32Array(64*AI_PLACES); // history heuristic of quiet moves
  this.killer =new Int32Array(AI_MAX_PLY+1).fill(-1);
  this.nodes=0;
  this.deadline=0;
  this.att=new Int32Array(2*AI_PLACES); // att[q*AI_PLACES+x]==stamp when q attacks x
  this.stamp=0;
};
/* generates moves of player p into mbuf[ply] with ordering values in obuf[ply].
  returns the number of moves. */
AIBoard.prototype.genMoves=function(p,capturesOnly,ply){
  var mb=this.mbuf[ply], ob=this.obuf[ply];
  var cnt=0;
  var ids=this.ids[p];
  var killer=this.killer[ply];
  for(var j=0;j<ids.length;j++){
    var id=ids[j];
    if(!this.alive[id]) continue;
    var x=this.px[id];
    var masks=AI_MASKS[this.pk[id]];
    for(var t=0;t<masks.length;t++){
      var to=x^masks[t];
      var cap=this.sq[to];
      var m=id*AI_PLACES+to;
      if(cap>=0){
        if(this.pp[cap]==p) continue; // own piece
        mb[cnt]=m;
        // larger victim first, smaller attacker first
        ob[cnt]=AI_ORDER_CAPTURE+(cap==this.king[1-p]?(1<<26):AI_VALUE[this.pk[cap]]*1000)
               -(this.pk[id]==AI_KIND_K?999:AI_VALUE[this.pk[id]]);
        cnt++;
      }else if(!capturesOnly){
        mb[cnt]=m;
        ob[cnt]=(m==killer)?AI_ORDER_KILLER:this.history[m];
        cnt++;
      }
    }
  }
  return cnt;
};
// moves the best remaining move (by ordering value) to index i and returns it
AIBoard.prototype.pick=function(ply,i,cnt){
  var mb=this.mbuf[ply], ob=this.obuf[ply];
  var b=i;
  for(var j=i+1;j<cnt;j++) if(ob[j]>ob[b]) b=j;
  var m=mb[b]; mb[b]=mb[i]; mb[i]=m;
  var o=ob[b]; ob[b]=ob[i]; ob[i]=o;
  return m;
};
AIBoard.prototype.make=function(m){
  var id=(m/AI_PLACES)|0, to=m%AI_PLACES;
  var cap=this.sq[to];
  var h=this.hTop++;
  this.hId[h]=id; this.hFrom[h]=this.px[id]; this.hCap[h]=cap;
  if(cap>=0) this.alive[cap]=0;
  this.sq[this.px[id]]=-1;
  this.sq[to]=id;
  this.px[id]=to;
};
AIBoard.prototype.undo=function(){
  var h=--this.hTop;
  var id=this.hId[h], cap=this.hCap[h];
  this.sq[this.px[id]]=cap;
  if(cap>=0) this.alive[cap]=1;
  this.sq[this.hFrom[h]]=id;
  this.px[id]=this.hFrom[h];
};
// true when move m captures a KING
AIBoard.prototype.isKingCapture=function(m){
  var cap=this.sq[m%AI_PLACES];
  return cap>=0 && this.pk[cap]==AI_KIND_K;
};
// static score for player p (material and closeness to the opponent KING)
AIBoard.prototype.evaluate=function(p){
  var s=0;
  for(var q=0;q<2;q++){
    var kx=this.px[this.king[1-q]];
    var ids=this.ids[q];
    var sq=0;
    for(var j=0;j<ids.length;j++){
      var id=ids[j];
      if(!this.alive[id]) continue;
      var k=this.pk[id];
      if(k==AI_KIND_K) continue;
      sq+=AI_VALUE[k]+AI_NEAR[k]*(AI_DIMS-AI_POPCOUNT[this.px[id]^kx]);
    }
    s+=(q==p)?sq:-sq;
  }
  // places next to each KING that are attacked by the opponent
  var stamp=++this.stamp;
  var att=this.att;
  for(var q=0;q<2;q++){
    var ids=this.ids[q];
    var kx=this.px[this.king[1-q]];
    for(var j=0;j<ids.length;j++){
      var id=ids[j];
      if(!this.alive[id] || this.pk[id]==AI_KIND_K) continue;
      var x=this.px[id];
      var dist=AI_POPCOUNT[x^kx];
      if(dist>5) continue; // can not attack a place next to the KING
      var masks=AI_MASKS[this.pk[id]];
      for(var t=0;t<masks.length;t++) att[q*AI_PLACES+(x^masks[t])]=stamp;
    }
  }
  for(var q=0;q<2;q++){
    var kx=this.px[this.king[1-q]];
    var masks=AI_MASKS[AI_KIND_K];
    var c=0;
    for(var t=0;t<masks.length;t++){
      var y=kx^masks[t];
      if(att[q*AI_PLACES+y]==stamp) c++;
    }
    s+=(q==p)?AI_PRESS*c:-AI_PRESS*c;
  }
  return s;
};
var AI_TIMEOUT={}; // thrown when the time is up
var aiLastDepth=0;  // depth of the last finished search (for debug)
AIBoard.prototype.checkTime=function(){
  if((++this.nodes & 255)==0 && aiNow()>this.deadline) throw AI_TIMEOUT;
};
// negamax with alpha-beta pruning. returns the score for player p.
AIBoard.prototype.search=function(depth,alpha,beta,p,ply){
  this.checkTime();
  if(depth<=0 || ply>=AI_MAX_PLY) return this.quiesce(alpha,beta,p,ply,0);
  var cnt=this.genMoves(p,false,ply);
  if(cnt==0) return this.evaluate(p);
  /* futility pruning: at depth 1, a quiet move of a non-KING piece scores
    at most stand+AI_FUTILITY, so it can be skipped when that is <= alpha. */
  var futile=false, stand=0;
  if(depth==1){
    stand=this.evaluate(p);
    futile=(stand+AI_FUTILITY<=alpha);
  }
  var best=-Infinity;
  for(var i=0;i<cnt;i++){
    var m=this.pick(ply,i,cnt);
    if(this.isKingCapture(m)) return AI_WIN+depth; // a faster win is better
    if(futile && this.sq[m%AI_PLACES]<0 && this.pk[(m/AI_PLACES)|0]!=AI_KIND_K){
      if(stand+AI_FUTILITY>best) best=stand+AI_FUTILITY;
      continue;
    }
    this.make(m);
    var v=-this.search(depth-1,-beta,-alpha,1-p,ply+1);
    this.undo();
    if(v>best) best=v;
    if(v>alpha) alpha=v;
    if(alpha>=beta){
      if(this.sq[m%AI_PLACES]<0){ // quiet move made the cut
        this.killer[ply]=m;
        this.history[m]+=depth*depth;
      }
      break;
    }
  }
  return best;
};
// search of captures only, to avoid stopping in the middle of an exchange
AIBoard.prototype.quiesce=function(alpha,beta,p,ply,qd){
  this.checkTime();
  var stand=this.evaluate(p);
  if(stand>=beta || ply>=AI_MAX_PLY || qd>=AI_QDEPTH) return stand;
  if(stand>alpha) alpha=stand;
  var cnt=this.genMoves(p,true,ply);
  var best=stand;
  for(var i=0;i<cnt;i++){
    var m=this.pick(ply,i,cnt);
    if(this.isKingCapture(m)) return AI_WIN;
    // delta pruning: this capture can not raise the score above alpha
    if(this.pk[(m/AI_PLACES)|0]!=AI_KIND_K
       && stand+AI_VALUE[this.pk[this.sq[m%AI_PLACES]]]+AI_FUTILITY*4<=alpha) continue;
    this.make(m);
    var v=-this.quiesce(-beta,-alpha,1-p,ply+1,qd+1);
    this.undo();
    if(v>best) best=v;
    if(v>alpha) alpha=v;
    if(alpha>=beta) break;
  }
  return best;
};
/* returns the move of COM (player p) as [k,i,x]:
  move piece i of kind k (index of state.board[p][k]) to place x.
  returns null when p has no move.
  iterative deepening: search depth 1,2,3,... and use the result
  of the deepest search finished within AI_TIME_MS. */
var comChooseMove=function(board,p){
  var b=new AIBoard(board);
  var cnt=b.genMoves(p,false,0);
  if(cnt==0) return null;
  var moves=Array.from(b.mbuf[0].subarray(0,cnt));
  // random order among moves of the same ordering value
  for(var i=moves.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=moves[i]; moves[i]=moves[j]; moves[j]=t;
  }
  moves.sort(function(x,y){
    return (b.isKingCapture(y)?1:0)-(b.isKingCapture(x)?1:0)
        || (b.sq[y%AI_PLACES]>=0?1:0)-(b.sq[x%AI_PLACES]>=0?1:0);
  });
  var best=moves[0];
  aiLastDepth=0;
  b.deadline=aiNow()+AI_TIME_MS;
  for(var depth=1;depth<=AI_MAX_DEPTH && !b.isKingCapture(best);depth++){
    var dbest=-1, bestv=-Infinity, alpha=-Infinity;
    try{
      for(var i=0;i<moves.length;i++){
        b.make(moves[i]);
        var v=-b.search(depth-1,-Infinity,-alpha,1-p,1);
        b.undo();
        if(v>bestv){ bestv=v; dbest=moves[i]; }
        if(v>alpha) alpha=v;
      }
    }catch(e){
      if(e!==AI_TIMEOUT) throw e;
      while(b.hTop>0) b.undo();
      break; // the search of this depth is not finished
    }
    best=dbest;
    aiLastDepth=depth;
    if(bestv>=AI_WIN || bestv<=-AI_WIN) break; // the result is decided
    // search the best move first at the next depth
    moves.splice(moves.indexOf(dbest),1);
    moves.unshift(dbest);
  }
  var id=(best/AI_PLACES)|0;
  return [b.pk[id], b.pi[id], best%AI_PLACES];
};
if(typeof module!=="undefined") module.exports={AIBoard:AIBoard,comChooseMove:comChooseMove,AI_MASKS:AI_MASKS};

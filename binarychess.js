/*----------------------------------
  binarychess.js
  main program and entry point
----------------------------------*/

//game------------------
var dims = 7;
//kind of piece
var kind_k = 0; // king
var kind_b = 1; // bishop
var kind_r = 2; // rook
var kinds  = 3;
kindstr   = ['KING','BISHOP','ROOK'];
kindlabel = [' KING ','BISHOP',' ROOK ']; // same width on the board
playerstr = ['white','black'];

/* state: state of the game
  state.turn  = player index in his turn (0 or 1)
  state.board[p][k][i] = 0xXX
    p = player index, k=kind index of piece, i = piece index
    XX is a format '7 bit binary location' of piece (p,k,i)
    for example:
      "state.board[0][1][3] == 0x13" means
      "#4 bishop of the player #0 is at (0,1, 0,0,1,1)." */
var state = function(){};

var viewpoint = 0x00; // view point for display (format is 7 bit binary location)


var initGame=function(s){
  s.turn = 0;
  s.board = new Array(2); //players
  //white player
  s.board[0] = new Array(kinds);
  s.board[0][kind_k] = [0x00];                               // kings
  s.board[0][kind_b] = [0x01,0x02,0x04,0x08,0x10,0x20,0x40]; // bishop
  s.board[0][kind_r] = new Array(21);                        // rook
  var r=0;
  for(var x=0;x<dims;x++){
    for(var y=x+1;y<dims;y++){
      s.board[0][kind_r][r] = 1<<x | 1<<y;
      r++;
    }
  }
  //black player
  s.board[1] = s.board[0].clone();
  for(var k=0;k<kinds;k++){
    s.board[1][k].forEach(function(v,i,a){
      a[i]=~v & 0x7F;
    });
  }
};
/* [res, msg] = move(s, m)
   makes the m as m from the state s.
   m = [t,k,i,x]
    t = turn
    k = kind index of the piece to move
    i = piece index to move
    x = destination (7 bit binary location)
   effect:
     - state is changed with the m.
     - res = boolean which indicates m is valid
     - msg = message (the result of the game when the opp king is taken)
*/
var move=function(s, m){
  var own = m[0] & 1;
  var k = m[1];
  var i = m[2];
  var x = m[3] & 0x7F;
  var opp = ~own&1;

  // check matching between kind and m
  var diff = s.board[own][k][i] ^ x;
  var diffs = (diff&1) + (diff>>1&1) + (diff>>2&1) + (diff>>3&1) + (diff>>4&1) + (diff>>5&1) + (diff>>6&1);
  if(diffs==0 || k==kind_k && diffs>3 || k==kind_b && diffs!=2 || k==kind_r && diffs!=1){
    return [false, kindstr[k]+" can't move so."];
  }
  //own collision
  for(var k1=0;k1<kinds;k1++){
    for(var i1=0;i1<s.board[own][k1].length;i1++){
      if(x == s.board[own][k1][i1]){
        //own piece is jamming -> can't move
        return [false, kindstr[k]+" can't move onto own piece."];
      }
    }//i
  }//k
  //attack
  var msg = "";
  for(var k1=0;k1<kinds;k1++){
    for(var i1=0;i1<s.board[opp][k1].length;i1++){
      if(x == s.board[opp][k1][i1]){
        //there exist opp piece -> attack
        s.board[opp][k1].splice(i1,1); //remove opp piece
        if(k1==kind_k) msg = playerstr[own]+" took the KING. "+playerstr[own]+" won!";
        break;
      }
    }//i
  }//k

  s.board[own][k][i] = x;     // renew board
  s.turn             = opp; // renew turn
  return [true, msg];
}

//UI----------------------------
var isCom    = [false,false]; //isCom[p]=true when player p is COM
var COM_DELAY = 500;          //[ms] wait before COM's move in COM vs COM
var gameId   = 0;             //incremented by startGame to cancel the COM of an old game
var thinking = false;
var isOver   = false;         //true after the game is over until start
var lastmsg  = "";            //message shown above the board

var locstr=function(x){
  var str="";
  for(var e=0;e<dims;e++) str += x>>(dims-e-1) & 1;
  return str;
};
//get game mode from radio buttons
var getIsCom=function(){
  var checked=document.querySelector('input[name="mode"]:checked');
  var mode=checked?checked.value:"com-human";
  if(mode=="com-human") return [true ,false];
  if(mode=="human-com") return [false,true ];
  if(mode=="com-com"  ) return [true ,true ];
  return [false,false];
};
var selected = -1;            //place of the selected piece of the human, or -1
var clickTimer = null;        //single click waits for a double click

var popcount=function(x){
  return (x&1) + (x>>1&1) + (x>>2&1) + (x>>3&1) + (x>>4&1) + (x>>5&1) + (x>>6&1);
};
// true when a piece of kind k can move from x to y (by the number of flipped bits)
var canReach=function(k,x,y){
  var n=popcount(x^y);
  if(k==kind_k) return n>=1 && n<=3;
  if(k==kind_b) return n==2;
  return n==1;
};
/* findPiece(s, x) returns [p,k,i] of the piece on place x, or null */
var findPiece=function(s, x){
  for(var p=0;p<2;p++){
    for(var k=0;k<kinds;k++){
      var i=s.board[p][k].indexOf(x);
      if(i>=0) return [p,k,i];
    }
  }
  return null;
};
// true when the human can move pieces now
var isHumanTurn=function(){
  return !isOver && !thinking && !isCom[state.turn];
};
//location as cells: 0 = white cell, 1 = black cell
var bitshtml=function(x){
  var str="";
  for(var e=0;e<dims;e++) str += (x>>(dims-e-1) & 1) ? "<span class=b1>1</span>" : "<span class=b0>0</span>";
  return str;
};
//display
var displayBoard = function(s, v, msg){
  var sel = (selected>=0 && isHumanTurn()) ? findPiece(s, selected) : null;
  var diffscope = [ [],[],[],[],[],[],[],[] ];
  // pieces
  for(var p=0;p<2;p++){
    for(var k=0;k<kinds;k++){
      for(var i=0;i<s.board[p][k].length;i++){
        var x = s.board[p][k][i];
        var cls = "";
        if(sel){
          if(x==selected) cls = "sel";
          else if(p!=s.turn && canReach(sel[1], selected, x)) cls = "tgt";
        }else if(isHumanTurn() && p==s.turn){
          cls = "own";
        }
        diffscope[popcount(v^x)].push({p:p, k:k, x:x, cls:cls});
      }//i
    }//k
  }//p
  // empty places where the selected piece can move to
  if(sel){
    for(var x=0;x<(1<<dims);x++){
      if(canReach(sel[1], selected, x) && findPiece(s, x)==null){
        diffscope[popcount(v^x)].push({p:sel[0], k:sel[1], x:x, cls:"cand"});
      }
    }
  }
  out = "";
  if(isOver){
    out += "<p>game over. push start to play again.<br>";
  }else{
    out += "<p>next turn is <span class=p"+s.turn+">"+playerstr[s.turn]+"</span> side"+(isCom[s.turn]?" (COM)":"")+"."+(thinking?" (thinking...)":"")+"<br>";
  }
  out += msg + "</p>";
  out += "<table class=whiteborder><tr>";
  for(var d=0;d<dims+1;d++){
    out += "<td class=whiteborder width="+(100/(dims+1))+"%>distance = " + d + ":<br><table>";
    for(var j=0;j<diffscope[d].length;j++){
      var e = diffscope[d][j];
      out += "<tr><td class='piece "+e.cls+"' onclick='clickPlace("+e.x+")' ondblclick='dblclickPlace("+e.x+")'>";
      out += "<span class='label p"+e.p+"'>"+kindlabel[e.k]+"</span> ";
      out += bitshtml(e.x);
      out += "</td></tr>";
    }//j
    out += "</table></td>";
  }//d
  out += "</tr></table>";
  document.getElementById("display").innerHTML = out;
}
var redraw=function(){
  displayBoard(state, viewpoint, lastmsg);
};
/* play m = [k,i,x] of the current player.
  returns [res, msg] of move(). */
var playMove=function(m){
  var p = state.turn;
  var from = state.board[p][m[0]][m[1]];
  var r = move(state, [p, m[0], m[1], m[2]]);
  if(!r[0]){
    lastmsg = r[1];
    redraw();
    return r;
  }
  lastmsg = "<span class=p"+p+">"+playerstr[p]+"</span>"+(isCom[p]?" (COM)":"")+": "
          + kindstr[m[0]]+" "+locstr(from)+" -&gt; "+locstr(m[2])+"<br>";
  selected = -1;
  if(r[1]!=""){
    lastmsg += r[1];
    isOver = true;
    gameId++; //cancel COM of this game
  }
  redraw();
  return r;
};
//COM plays when it is COM's turn
var startComIfTurn=function(){
  if(isOver || !isCom[state.turn]) return;
  thinking=true;
  redraw();
  var id=gameId;
  setTimeout(function(){ //let the browser draw the output first
    if(id!=gameId) return;
    var m=comChooseMove(state.board, state.turn);
    if(id!=gameId) return;
    thinking=false;
    if(m==null){
      lastmsg += playerstr[state.turn]+" has no move. "+playerstr[1-state.turn]+" won!";
      isOver=true;
      gameId++;
      redraw();
      return;
    }
    playMove(m);
    startComIfTurn(); //next COM in COM vs COM
  },(isCom[0]&&isCom[1])?COM_DELAY:50);
};
//start (or restart) the game
var startGame=function(){
  gameId++;
  thinking=false;
  isOver=false;
  isCom=getIsCom();
  selected=-1;
  initGame(state);
  lastmsg="GAME START!";
  redraw();
  startComIfTurn();
};
/* the human moves the piece on place from to place to.
  returns true when the move is done. */
var humanMove=function(from, to){
  if(!isHumanTurn()) return false;
  var f=findPiece(state, from);
  if(f==null || f[0]!=state.turn) return false;
  var r=playMove([f[1], f[2], to]);
  if(r[0]) startComIfTurn();
  return r[0];
};
//mouse
/* click on place x:
  own piece          -> select it (click again to cancel)
  target of selected -> move the selected piece there
  others             -> cancel the selection */
var doClick=function(x){
  if(!isHumanTurn()) return;
  var f=findPiece(state, x);
  if(f!=null && f[0]==state.turn){
    selected = (selected==x) ? -1 : x;
    redraw();
    return;
  }
  if(selected>=0){
    var sel=findPiece(state, selected);
    if(sel!=null && canReach(sel[1], selected, x)){
      humanMove(selected, x);
      return;
    }
  }
  selected = -1;
  redraw();
};
var clickPlace=function(x){
  if(clickTimer!=null) clearTimeout(clickTimer);
  clickTimer=null;
  if(findPiece(state, x)==null){ // empty place can not be double clicked
    doClick(x);
    return;
  }
  clickTimer=setTimeout(function(){ clickTimer=null; doClick(x); }, 250);
};
/* double click on a piece:
  white piece -> its place becomes distance = 0
  black piece -> its place becomes distance = 7 */
var dblclickPlace=function(x){
  if(clickTimer!=null) clearTimeout(clickTimer);
  clickTimer=null;
  var f=findPiece(state, x);
  if(f==null) return;
  viewpoint = (f[0]==0) ? x : (~x & 0x7F);
  redraw();
};

//entry point
window.onload=function(){
  startGame();
};

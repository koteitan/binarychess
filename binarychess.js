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
//display
var displayBoard = function(s, v, msg){
  var diffscope = [ [],[],[],[],[],[],[],[] ];
  for(var p=0;p<2;p++){
    for(var k=0;k<kinds;k++){
      for(var i=0;i<s.board[p][k].length;i++){
        var x = s.board[p][k][i];
        var diff = v ^ x;
        var diffs = (diff&1) + (diff>>1&1) + (diff>>2&1) + (diff>>3&1) + (diff>>4&1) + (diff>>5&1) + (diff>>6&1);
        diffscope[diffs].push([p,k,i,x]);
      }//i
    }//k
  }//p
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
      out += "<tr><td>";
      var p = diffscope[d][j][0];
      var k = diffscope[d][j][1];
      var i = diffscope[d][j][2];
      var x = diffscope[d][j][3];
      out += "<span class=p"+p+">"+kindstr[k]+"</span> ";
      out += locstr(x);
    }//i
    out += "</td></tr></table></td>";
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
  initGame(state);
  lastmsg="GAME START!";
  redraw();
  startComIfTurn();
};
var parseloc=function(str){
  var x = 0;
  for(var c=0;c<str.length;c++){
    if(str[c]=='1'){x<<=1;x|=1;}
    if(str[c]=='0'){x<<=1;     }
  }
  return x;
};
//input
var recvcmd=function(cmd){
  if(cmd.search("^ *[01]+ *$")!=-1){
    // digit only -> show
    viewpoint = parseloc(cmd);
    redraw();
    return cmd;
  }
  if(cmd.search("^ *[01]+ +[01]+ *$")!=-1){
    // digit space digit -> move
    if(isOver){
      lastmsg = "game is over. push start to play again.";
      redraw();
      return cmd;
    }
    if(thinking || isCom[state.turn]){
      lastmsg = "it is COM's turn.";
      redraw();
      return cmd;
    }
    var from = parseloc(cmd.match(/^ *[01]+/)[0]);
    var to   = parseloc(cmd.match(/[01]+ *$/)[0]);
    for(var k=0;k<kinds;k++){
      for(var i=0;i<state.board[state.turn][k].length;i++){
        if(from == state.board[state.turn][k][i]){
          var r=playMove([k,i,to]);
          if(r[0]) startComIfTurn();
          return cmd;
        }
      }
    }
    lastmsg = "there is no "+playerstr[state.turn]+" piece at "+locstr(from)+".";
    redraw();
  }
  return cmd;
};

//entry point
window.onload=function(){
  startGame();
};

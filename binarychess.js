/*----------------------------------
  binarychess.js
  main program and entry point
----------------------------------*/

//game------------------
var dims = 6;
//kind of piece
var kind_k = 0; // king
var kind_b = 1; // bishop
var kind_r = 2; // rook
var kinds  = 3;
kindstr   = ['king','bishop','rook'];
playerstr = ['white','black'];

/* state: state of the game
  state.turn  = player index in his turn (0 or 1)
  state.board[p][k][i] = 0xXX
    p = player index, k=kind index of piece, i = piece index
    XX is a format '6 bit binary location' of piece (p,k,i)
    for example:
      "state.board[0][1][3] == 0x13" means
      "#4 bishop of the player #0 is at (0,1, 0,0,1,1)." */
var state = function(){};

var initGame=function(state){
  state.turn = 0;
  state.board = new Array(2); //players
  //white player
  state.board[0] = new Array(kinds);
  state.board[0][kind_k] = [0x00];                          // kings
  state.board[0][kind_b] = [0x01,0x02,0x04,0x08,0x10,0x20]; // bishop
  state.board[0][kind_r] = new Array(15);                   // rook
  var r=0;
  for(var x=0;x<dims;x++){
    for(var y=x+1;y<dims;y++){
      state.board[0][kind_r][r] = 1<<x | 1<<y;
      r++;
    }
  }
  //black player
  state.board[1] = state.board[0].clone();
  for(var k=0;k<kinds;k++){
    state.board[1][k].forEach(function(v,i,a){a[i]=~v & 0x3F;});
  }
};
/* [res, msg] = move(state, motion)
   makes the motion as 'motion' from the state 'state'.
   motion = [t,k,i,x]
    t = turn
    k = kind index of the piece to move
    i = piece index to move
    x = destination (6 bit binary location)
   effect:
     - state is changed with the motion.
     - res = boolean which indicates motion is valid
     - msg = message
*/
var move=function(state, motion){
  var own = motion[0] & 1;
  var k = motion[1];
  var i = motion[2];
  var x = motion[3] & 0x3F;
  var opp = ~own&1;

  // turn check, array index check
  var diff = state.board[own][k][i] ^ x;
  var diffs = (diff&1) + (diff>>1&1) + (diff>>2&1) + (diff>>3&1) + (diff>>4&1) + (diff>>5&1);
  // check matching between kind and motion 
  if(diffs==0 || k==0 && diffs>3 || k==1 && diffs!=2 && k==2 && diffs!=1){
    var result = function(){};
    res = false;
    msg = kindstr[k]+" can't move so.";
    return  [res, msg];
  }
  //own collision
  for(var k=0;k<kinds;k++){
    for(var i=0;i<state.board[own][k].length;i++){
      if(x == state.board[own][k][i]){
        //own piece is jamming -> can't move
        var result = function(){};
        res = false;
        msg = kindstr[k]+" can't move onto own piece.";
        return [res, msg];
      }
    }//i
    for(var i=0;i<state.board[opp][k].length;i++){
      if(x == state.board[opp][k][i]){
        //there exist opp piece -> attack
        state.board[opp][k].splice(i,1); //remove opp piece
        break;
      }
    }//i
  }//k
  
  state.board[own][k][i] = x;     // renew board
  state.turn             = opp; // renew turn
  return [true, "next turn is "+playerstr[opp]+" side."];
}

//UI----------------------------
var recvcmd=function(cmd){
  document.getElementById("display").innerHTML = "<table><tr><td>"+cmd+"1</td><td>"+cmd+"2</td></tr></table>";
  return "3";
};

window.onload=function(){
  initGame(state);
};


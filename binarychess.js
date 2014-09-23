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

var viewpoint = 0x00; // view point for display (format is 6 bit binary location)


var initGame=function(s){
  s.turn = 0;
  s.board = new Array(2); //players
  //white player
  s.board[0] = new Array(kinds);
  s.board[0][kind_k] = [0x00];                          // kings
  s.board[0][kind_b] = [0x01,0x02,0x04,0x08,0x10,0x20]; // bishop
  s.board[0][kind_r] = new Array(15);                   // rook
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
      a[i]=~v & 0x3F;
    });
  }
};
/* [res, msg] = move(s, m)
   makes the m as m from the state s.
   m = [t,k,i,x]
    t = turn
    k = kind index of the piece to move
    i = piece index to move
    x = destination (6 bit binary location)
   effect:
     - state is changed with the m.
     - res = boolean which indicates m is valid
     - msg = message
*/
var move=function(s, m){
  var own = m[0] & 1;
  var k = m[1];
  var i = m[2];
  var x = m[3] & 0x3F;
  var opp = ~own&1;

  // turn check, array index check
  var diff = s.board[own][k][i] ^ x;
  var diffs = (diff&1) + (diff>>1&1) + (diff>>2&1) + (diff>>3&1) + (diff>>4&1) + (diff>>5&1);
  // check matching between kind and m 
  if(diffs==0 || k==0 && diffs>3 || k==1 && diffs!=2 && k==2 && diffs!=1){
    var result = function(){};
    res = false;
    msg = kindstr[k]+" can't move so.";
    return  [res, msg];
  }
  //own collision
  for(var k1=0;k1<kinds;k1++){
    for(var i1=0;i1<s.board[own][k1].length;i1++){
      if(x == s.board[own][k1][i1]){
        //own piece is jamming -> can't move
        var result = function(){};
        res = false;
        msg = kindstr[k1]+" can't move onto own piece.";
        return [res, msg];
      }
    }//i
    for(var i1=0;i1<s.board[opp][k1].length;i1++){
      if(x == s.board[opp][k1][i1]){
        //there exist opp piece -> attack
        s.board[opp][k1].splice(i1,1); //remove opp piece
        break;
      }
    }//i
  }//k
  
  s.board[own][k][i] = x;     // renew board
  s.turn             = opp; // renew turn
  return [true, ""];
}

//UI----------------------------
//display
var displayBoard = function(s, v){
  var diffscope = [ [],[],[],[],[],[],[] ];
  for(var p=0;p<2;p++){
    for(var k=0;k<kinds;k++){
      for(var i=0;i<s.board[p][k].length;i++){
        var x = s.board[p][k][i];
        var diff = v ^ x;
        var diffs = (diff&1) + (diff>>1&1) + (diff>>2&1) + (diff>>3&1) + (diff>>4&1) + (diff>>5&1);
        diffscope[diffs].push([p,k,i,x]);
      }//i
    }//k
  }//p
  out = "";
  out += "<table class=whiteborder><tr>";
  for(var d=0;d<dims+1;d++){
    out += "<td class=whiteborder width=14.2%>distance = " + d + ":<br><table>";
    for(var j=0;j<diffscope[d].length;j++){
      out += "<tr><td>";
      var p = diffscope[d][j][0];
      var k = diffscope[d][j][1];
      var i = diffscope[d][j][2];
      var x = diffscope[d][j][3];
      out +=        playerstr[p];
      out += " "  + kindstr  [k];
      out += " "  + "#" + i + " at ";
      for(var e=0;e<dims;e++){
        out += x>>(dims-e-1) & 1;
      }//e
    }//i
    out += "</td></tr></table></td>";
  }//d
  out += "</tr></table>";
  out += "<p>next turn is "+playerstr[s.turn]+" side.</p>";
  document.getElementById("display").innerHTML = out;
}
//input
var recvcmd=function(cmd){
  if(cmd.search("^ *[01]+ *$")!=-1){
    // digit only -> show
    var x = 0;
    for(var c=0;c<cmd.length;c++){//backword
      if(cmd[c]=='1'){x<<=1;x|=1;}
      if(cmd[c]=='0'){x<<=1;     }
    }
    viewpoint = x;
    displayBoard(state, viewpoint);
  }
  if(cmd.search("^ *[01]+ +[01]+ *$")!=-1){
    // digit space digit -> move
    var fromstr = cmd.match(/^ *[01]+/)[0];
    var from = 0;
    for(var c=0;c<fromstr.length;c++){//backword
      if(fromstr[c]=='1'){from<<=1;from|=1;}
      if(fromstr[c]=='0'){from<<=1;     }
    }
    var tostr   = cmd.match(/[01]+ *$/g)[0];
    var to = 0;
    for(var c=0;c<tostr.length;c++){//backword
      if(tostr[c]=='1'){to<<=1;to|=1;}
      if(tostr[c]=='0'){to<<=1;     }
    }
  }
  for(var k=0;k<kinds;k++){
    for(var i=0;i<state.board[state.turn][k].length;i++){
      if(from == state.board[state.turn][k][i]){
        var r=move(state, [state.turn, k,i,to]);
        if(r[0]){
          displayBoard(state, viewpoint);
        }else{
          displayBoard(state, viewpoint);
          document.getElementById("display").innerHTML +=
            "<p>"+r[1]+"</p>";
        }
        break;
      }
    }
  }
  return cmd;
};

//entry point
window.onload=function(){
  initGame(state);
  displayBoard(state, viewpoint);
};

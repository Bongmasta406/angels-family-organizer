import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
apiKey: "AIzaSyDNIRnr11v4lpOclCdJqLZdqC2oeuaEplg",
authDomain: "angels-family-organizer.firebaseapp.com",
projectId: "angels-family-organizer"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const $ = id => document.getElementById(id);

$("signInBtn").onclick = async () => {
try{
await signInWithEmailAndPassword(auth,$("authEmail").value,$("authPassword").value);
}catch(e){
$("authMessage").innerText = e.message;
}
}

$("resetPasswordBtn").onclick = () => {
sendPasswordResetEmail(auth,$("authEmail").value);
}

$("signOutBtn").onclick = () => signOut(auth);

onAuthStateChanged(auth,user=>{
if(user){
$("authView").classList.add("hidden");
$("appView").classList.remove("hidden");
}else{
$("appView").classList.add("hidden");
$("authView").classList.remove("hidden");
}
});

// TAB SYSTEM
const tabs=document.querySelectorAll(".tabBtn");
const sections=document.querySelectorAll(".tabSection");

tabs.forEach(btn=>{
btn.onclick=()=>{

tabs.forEach(b=>b.classList.remove("active"));
btn.classList.add("active");

sections.forEach(s=>s.classList.add("hidden"));
document.getElementById(btn.dataset.tab+"Section").classList.remove("hidden");

}
})

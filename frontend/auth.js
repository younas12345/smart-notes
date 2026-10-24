const apiBaseUrl = (() => {
    const configuredUrl = document.querySelector('meta[name="api-base-url"]')?.content || "";
    return configuredUrl.startsWith("%") ? "" : configuredUrl.replace(/\/$/, "");
})();

async function signup(){

    const name=document.getElementById("name").value.trim();

    const email=document.getElementById("email").value.trim();

    const password=document.getElementById("password").value.trim();

    if(!name || !email || !password){

        alert("Please fill all fields");

        return;

    }

    try{

        const response=await fetch(`${apiBaseUrl}/signup`,{

            method:"POST",

            headers:{
                "Content-Type":"application/json"
            },

            body:JSON.stringify({

                name,
                email,
                password

            })

        });

        const data=await response.json();

        document.getElementById("message").innerText=data.message;

        if(response.ok){

            setTimeout(()=>{

                window.location.href="login.html";

            },1500);

        }

    }

    catch(error){

        console.log(error);

        alert("Server Error");

    }

}
//login form
async function login(){

    const email=document.getElementById("email").value.trim();
    const password=document.getElementById("password").value.trim();

    if(!email || !password){

        alert("Please fill all fields");
        return;

    }

    try{

        const response=await fetch(`${apiBaseUrl}/signin`,{

            method:"POST",

            headers:{
                "Content-Type":"application/json"
            },

            body:JSON.stringify({
                email,
                password
            })

        });

        const data=await response.json();

        document.getElementById("message").innerText=data.message;

        if(response.ok){

            // JWT Token Save
            localStorage.setItem("token",data.token);

            // Redirect
            setTimeout(()=>{

                window.location.href="index.html";

            },1000);

        }

    }
    catch(error){

        console.error(error);

        alert("Server Error");

    }

}
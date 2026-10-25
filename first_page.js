// store the selected genre in local storage
const dropdown = document.getElementById("genres");
const button = document.getElementById("submit");
let storedValue = ""; // Variable to hold the value

button.addEventListener("click", () => {
  storedValue = dropdown.value; // Gets the selected option's value
  localStorage.setItem("savedDropdownValue", storedValue);
});
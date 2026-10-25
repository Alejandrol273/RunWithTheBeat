// store the selected genre in local storage
const dropdown = document.getElementById("genres");
const button = document.getElementById("submit");
let storedValue = ""; // Variable to hold the value

button.addEventListener("click", () => {
  storedValue = dropdown.value; // Gets the selected option's value
  console.log("Stored value:", storedValue);

  // Optional: Save to browser storage if you need it to persist
  localStorage.setItem("savedDropdownValue", storedValue);
});
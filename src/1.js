"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var myname = 'liulei';
var age = 19;
var strList = ['1', '32', '43'];
var strArr = [23, 324];
// 元祖
var point = [3, 1];
// 枚举
var Gender;
(function (Gender) {
    Gender[Gender["BOY"] = 5] = "BOY";
    Gender[Gender["GIRL"] = 10] = "GIRL";
})(Gender || (Gender = {}));
console.log(Gender.BOY, Gender.GIRL);
// 可能为空或者dom元素 HTMLElement 是ts提供的
var root = document.getElementById('root');
// ！告诉ts别废话了不可能为空
root.style.color = 'red';
function getName(name) {
    console.log(name);
    // 严格模式关掉可以生效
    // return null return undifiend
}
var getUserName = function (firstName, lastName) {
    return {
        name: firstName + lastName
    };
};
function sum(num1, num2) {
    console.log(num1 + num2);
}
sum(1, 2);
sum('1', '2');
// sum(1,'2') // error

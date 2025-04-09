# Bendis micro framework

Bendis is minimalistic framework for rapid development of vanilla JavaScript web components.

If you prefer to work in a dependency free vanilla JavaScript environment while solely focusing on the task at hand not having to worry about boilerplating and building - Bendis is what you need.

## Creating Bendis based application

- create your project using NPM: `npm init`
- install bendis: `npm install bendis --save-dev`
- create bendis app: `npx bendis --create-application Sol`
- run dev server: `npx bendis`

That is it. You can start working on your web components right away.
Let's see in more detail what these commands do:

## `npm init` 
This is a regular npm command which creates and configures the `package.json` file for your new project. You can check out NPM docs for the details.

## `npm install bendis --save-dev`
This is how bendis is installed. Since bendis is development tool, it is recommended that it is installed as developer dependency.

## `npx bendis --create-application Sol`
This is how bendis app is created. You only need to run it once on an empty project. It will create all the files necessary to support easy web component development and single page web application development. The argument value ("Sol") is the name of your new app, there is also optional second argument value for the app prefix. This prefix will be used for all your web component tags and class names.

Below is sample output of this command:

```
☛ About to create application named "Sol" with prefix sol
☛ Created router class SolRouter with tag sol-route in /Users/oxd/Projects/sol/src/js/sol-route.js
☛ Created base class SolBase in /Users/oxd/Projects/sol/src/js/sol-base.js
☛ Created web component class SolApp with HTML tag: <sol-app></sol-app> in /Users/oxd/Projects/sol/src/js/sol-app.js and HTML template in /Users/oxd/Projects/sol/src/html/sol-app.html
☛ Creating /Users/oxd/Projects/sol/src/html/index.html
☛ Created web component class SolIndexPage with HTML tag: <sol-index-page></sol-index-page> in /Users/oxd/Projects/sol/src/js/sol-index-page.js and HTML template in /Users/oxd/Projects/sol/src/html/sol-index-page.html
☛ Added route / in /Users/oxd/Projects/sol/src/html/sol-app.html
☛ Created page controller IndexController in /Users/oxd/Projects/sol/src/js/controllers/index.js
```

It created:
- the application web component `<sol-app></sol-app>`
- a route for / uri with index page `<sol-index-page></sol-index-page>`
- a controller class for / route `IndexController` with `onRoute()` and `onRouteDestroy()` methods
- html templates for these web components in `src/html` directory

## `npx bendis`

This is the command you will be using the most during development. It will build your app and deploy it in the development web server. It will also watch for the changes on your files and rebuild whenever you change something. Below is a sample output:

```
npx bendis
Watching files... 

Built in 27ms. Now reloading...
The Sol development server is running on http://localhost:3434 serving from /Users/oxd/Projects/sol/dist directory.
```

## Building your app for production

To build the application as a single javascript file in an optimized form that works on wide range of browsers while compressed and obfuscated use the following command:
```
npx bendis --build
```
The `dist/` folder will now contain your production build.

## Bendis web components

Bendis contains the most basic tools for building your web components in pure JavaScript. To create a new web component `<sol-my-component>` run:

```
npx bendis --create-component MyComponent
```

The Bendis way or recommended structure of your web component is to split it into two files: the JavaScript file and the pure HTML file. Note the "pure" in pure HTML, it means that HTML should only contain standard HTML (and CSS) and nothing else.
The JavaScript file will contain a web component in a form of JavaScript class that extends HTMLElement. Note that it actualy extends from `Bendis` class which in turn extends from HTMLElement.

## Bendis class

This is where all the power of Bendis lies, it is a web component with a deep JavaScript Proxy which you can bind to DOM elements. This in effect greatly simplifies app development. Let's explain the basics.

```html

<h2></h2>
<ul>
    <li><strong></strong></li>
</li>

```

```javascript

// data
this.state = {
    foo: {
        bar: 'Foo Bar!'
    },
    baz:[{
        title: 'First'
    }, {
    title: 'Second'
    }]
}

// bindings
this.bind('foo.bar', 'h2')
this.bind('baz.*', 'li', Array)
this.bind('baz.*.title', 'strong')

```

The result would look something like this:


> ## Foo Bar!
> - **First**
> - **Second**


The bind function has the following signature:
```
bind(OBJECT_PATH, CSS_SELECTOR, CALLBACK) // binding a property or object to DOM node with optional callback
```

Since the state is a deep Proxy, it is simple to change the data as doing `this.state.foo.bar = "New Title!!"`
In a same manner, you can also mutate the array, for example to add another list item just: `this.state.baz.push({title: "New Item!"})` and immediately the DOM is modified and new list item is added.

Binding the deep Proxy to the DOM by default uses `innerHTML` but often you need to do something custom, like binding an event to the DOM element or doing something else to the DOM node. You can do that with callback functions:

```javascript

this.bind('foo.bar', 'h2', (ctx)=>{
    let {el, val} = ctx // callback context contains the bound DOM element, the ound value and much more
    el.innerHTML = val
})

```
Effect of the above binding is the same as previous one except here you have the callback exposed. The callback is triggered each time the proxy value is modified or removed.

In scenarios where array of objects are bound to the DOM, the elements closely follow the structure of the array so any removing splicing, deleting and other mutations of the array will be applied to the DOM elements. 
Adding events to proxied DOM elements would be difficult because of all the mutations, this is why the bind context has ustility `addEventListener` and `removeEventListener` functions that do all the work for you. For example, adding a click event to each title element in the array would look like this:

```javascript

this.bind('baz.*.title', 'strong', (ctx)=>{
    ctx.addEventListener('click', ()=>{
        console.log(`${ctx.el.nodeName} clicked`)
    })
})

```
This will ensure that this click event will trigger no matter what you do with the proxied array.
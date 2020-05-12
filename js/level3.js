function execute(datasets, type, alternatives) {
  const level = "token";
  const model = getUrlParameter("model");
  console.log(datasets)
  // SET UP WORKSPACE ###############################################################################################################################
  d3.select("h1").html("Level 3 (<em>" + type + "</em>)");
  d3.select("h3#modelName").html(model);

  // clear selection of models
  d3.select("#clearSelect")
    .on("click", () => { clearStorage(tokenSelection, level, type); });

  d3.select("#modelSelect")
    .on("click", function () {
      window.open("level2.html" + "?type=" + type, "_self");
    });

  // set up that doesn't depend on the solution

  const width = 600;
  const height = 600;
  const padding = 40;
  const modelSelection = listFromLS("modelselection-" + type);
  const tokenSelection = listFromLS(level + "selection-" + type);



  deploy(offerAlternatives(datasets, alternatives, type));
  d3.select("#solutions").selectAll("button").on("click", function (d) {
    localStorage.setItem("solution-" + type, JSON.stringify(d));
    d3.select("#solutions").selectAll("button").html(t => {
      return (t === d ? "<b>" + t + "</b>" : t);
    });
    deploy(datasets[d]);
  });


  updateTokSelection(tokenSelection);

  // FUNCTIONS ###############################################################################

  // update model selection
  function updateTokSelection(tokenSelection) {
    updateSelection(tokenSelection, level, type);
  }

  function deploy(coordinates) {
    const dataset = _.clone(coordinates);
    // _.merge(dataset, datasets["variables"]);
    mergeVariables(dataset, datasets["variables"]);
    
    const solutionName = JSON.parse(localStorage.getItem("solution-" + type));
    if (!(_.isNull(solutionName))) {
      const technique = solutionName.toLowerCase().search("tsne") > -1 ? "t-SNE, perplexity: " + solutionName.match("[0-9]+") : solutionName.toUpperCase();
      d3.select("h4#solutionName").text("Technique: " + technique);
    }

    // Set up variables

    initVars(dataset, level, type);
    const contexts = colnames["contexts"];
    let ctxtvar = varFromLS(dataset, "ctxt", level, type)["variable"];

    const tailoredContexts = contexts
      .filter(d => {
        return (d.split(".").length === 2 || model.search(d.split(".").splice(1).join(".")) === 0);
      })
      .map(d => {
        return ({
          "key": d.split(".").length === 2 ? d.split(".")[1] : "model",
          "value": d
        });
      });
    console.log(tailoredContexts)

    const tailoredNumerals = numerals
      .filter(function (d) {
        return (!d.startsWith("_count") || model.search(d.split(".").splice(1).join(".")) === 0);
      })
      .map(function (d) {
        return ({
          "key": d.startsWith("_count") ? "number of foc" : d,
          "value": d
        });
      });
    // These last lines are only if you use the "ctxt2" dropdown instead of "ctxt" (for tailored contexts, that is, matched to the cloud)

    // Context words!
    const cwsColumn = colnames["all"].filter(function (d) {
      return (d.startsWith("_cws") && model.search(d.slice(5)) === 0);
    });

    d3.select("#findTokensFeatureBtn").on("click", () => findByContext(cwsColumn, "Feature"));
    d3.select("#findTokensContextBtn").on("click", () => {
      findByContext((varFromLS(dataset, "ctxt", level, type)["variable"] || "_ctxt.raw"), "Context")
    });
    d3.select("#showTable").on("click", function () {
      const params = "width=400,height=700,menubar=no,toolbar=no,location=no,status=no";
      window.open("frequencyTable.html?type=" + type + "&column=" + cwsColumn, "freqtable", params);
    });


    // set up dropdowns #############################################################################
    buildDropdown("colour", nominals).on("click", function () {
      colorvar = updateVar(dataset, "color", this.value, level, type);
      colorselection = [];
      updatePlot();
      updateLegend(colorvar, shapevar, sizevar, padding, level, type, dataset);
    });

    buildDropdown("shape",
      nominals.filter(function (d) { return (d === "Reset" || getValues(dataset, d).length <= 7); })
    ).on("click", function () {
      shapevar = updateVar(dataset, "shape", this.value, level, type);
      shapeselection = [];
      updatePlot();
      updateLegend(colorvar, shapevar, sizevar, padding, level, type, dataset);
    });

    buildDropdown("size", tailoredNumerals, valueFunction = d => d.value, textFunction = d => d.key)
      .on("click", function () {
        sizevar = updateVar(dataset, "size", this.value, level, type);
        updatePlot();
        updateLegend(colorvar, shapevar, sizevar, padding, level, type, dataset);
      });

    buildDropdown("ctxt", tailoredContexts, valueFunction = d => d.value, textFunction = d => d.key)
      .on("click", function () { ctxtvar = updateVar(dataset, "ctxt", this.value, type)["variable"]; });

    buildDropdown("models", modelSelection,
      valueFunction = d => d,
      textFunction = d => {
        const txt = _.replace(d, type+".", "");
        return (d === model ? "<b>" + txt + "</b>" : txt)
      }
        )
      .on("click", function () {
        window.open("level3.html" + "?type=" + type + "&model=" + this.value, "_self");
      });

    // Set up canvas #######################################################################################
    d3.select("#svgContainer").selectAll("svg").remove();
    const svg = d3.select("#svgContainer").append("svg")
      .attr("width", width)
      .attr("height", height)
      .call(responsivefy)
      .attr("transform", "translate(0,0)")
      .append("g")
      .call(d3.zoom().on("zoom", zoomed));

    // Set up scales (axes, color...) - coordinates multiplied to get some padding in a way
    const xrange = setRange(getValues(dataset, model + ".x"), 1.1);
    const yrange = setRange(getValues(dataset, model + ".y"), 1.1);

    const x = d3.scaleLinear()
      .domain(xrange)
      .range([padding, width - padding]);

    const y = d3.scaleLinear()
      .domain(yrange)
      .range([height - padding, padding]);
    let newX = x;
    let newY = y;

    // Set up pointing area so you can have zoom with the mouse in any point of the plot
    setPointerEvents(svg, width, height);

    // Set up brush
    const brush = d3.brush()
      .extent([[0, 0], [width, height]])
      .on("start", () => _.pullAll(tokenSelection, tokenSelection))
      .on("brush", brushing)
      .on("end", brushed);

    // Select brush or click
    $(document).on("change", 'input[name="selection"]', function (event) {
      const svg = d3.select("#svgContainer").select("svg");
      if (d3.select(this).attr("value") === "brush") {
        svg.append("g")
          .attr("transform", "translate(" + padding + ", " + padding + ")")
          .attr("class", "brush")
          .call(brush);
      } else {
        svg.selectAll(".brush").remove();
      }
      _.pullAll(tokenSelection, tokenSelection);
      updateTokSelection(tokenSelection);
    });

    // Vertical center
    traceCenter(svg, x1 = newX(0), x2 = newX(0), y1 = padding, y2 = height - padding)
      .attr("id", "xCenter");

    // Horizontal center
    yCenter = traceCenter(svg, x1 = padding, x2 = width - padding, y1 = newY(0), y2 = newY(0))
      .attr("id", "yCenter")

    // Axes (tickSizeOuter(0) avoids overlap of axes)
    const xAxis = d3.axisBottom(newX).tickSizeOuter(0);
    svg.append("g")
      .attr("id", "xaxis")
      .attr("transform", "translate(0, " + (height - padding) + ")")
      .call(xAxis);

    const yAxis = d3.axisLeft(newY).tickSizeOuter(0);
    svg.append("g")
      .attr("id", "yaxis")
      .attr("transform", "translate(" + padding + ", 0)")
      .call(yAxis);

    // DRAW PLOT  #########################################################################################

    const present = dataset.filter(function (d) { return (exists(d, model)); });
    const bin = dataset.filter(function (d) { return (!(exists(d, model))); });

    // Dots on plot
    svg.append("g")
      .attr("transform", "translate(0,0)")
      .attr("class", "dot")
      .selectAll("path")
      .data(present).enter()
      .append("path")
      .attr("class", "graph present")
      .attr("transform", function (d) { return ("translate(" + newX(d[model + ".x"]) + "," + newY(d[model + ".y"]) + ")"); })
      .each(styleDot);

    // Lost tokens

    if (bin.length > 0) {
      const sidebar = d3.select("#sidebar");
      const sidebarWidth = parseInt(sidebar.style("width"));
      const dotsPerRow = Math.floor((sidebarWidth - 20) / 10);

      sidebar.append("hr");
      sidebar.append("h4").text("Lost tokens");

      sidebar.append("svg")
        .attr("width", sidebarWidth)
        .attr("transform", "translate(0,0)")
        .append("g")
        .attr("transform", "translate(" + 10 + "," + 10 + ")")
        .attr("class", "dot")
        .selectAll("path")
        .data(bin).enter()
        .append("path")
        .attr("class", "graph lost")
        .attr("transform", function (d) {
          const j = Math.floor(bin.indexOf(d) / dotsPerRow);
          const i = bin.indexOf(d) - (j * dotsPerRow);
          return ("translate(" + (i * 10) + "," + (j * 10) + ")");
        })
        .each(styleDot);
    }

    const dot = d3.selectAll(".dot").selectAll("path");
    const dot_present = d3.selectAll(".dot").selectAll("path.present");
    updateLegend(colorvar, shapevar, sizevar, padding, level, type, dataset);

    // FUNCTIONS #######################################################################################################
    // Zoom
    function zoomed() {
      newY = d3.event.transform.rescaleY(y);
      newX = d3.event.transform.rescaleX(x);
      svg.select("#xaxis").call(xAxis.scale(newX)); // x axis rescaled
      svg.select("#yaxis").call(yAxis.scale(newY)); // y axis rescaled
      dot_present.attr("transform", function (d) { return ("translate(" + newX(d[model + ".x"]) + "," + newY(d[model + ".y"]) + ")"); }); // dots repositioned
      d3.select("#xCenter").attr("x1", newX(0)).attr("x2", newX(0)); // central x rescaled
      d3.select("#yCenter").attr("y1", newY(0)).attr("y2", newY(0)); // central y rescaled
      svg.selectAll(".brush").remove();
    };

    // Token search

    function findByContext(column, by) {
      const cw2search = d3.select("#findTokensBy" + by).property("value").toLowerCase();
      const result = dataset.filter(d => {
        return (d[column].search(cw2search) !== -1);
      });
      if (result.length > 0) {
        _.pullAll(tokenSelection, tokenSelection);
        result.forEach(function (d) { tokenSelection.push(d["_id"]) });
        updateTokSelection(tokenSelection);
      } else {
        const spec = by === "Feature" ? "as a feature" : "in a concordance";
        window.alert('Sorry, "' + cw2search + '" is not present ' + spec + ' in this model.');
      }
    }
    // Show concordance above plot
    function showContext(d) {
      const tooltipColor = code(d, colorvar, color, "#1f77b4");
      // var tooltiptext = typeof(ctxtvar) == "string" ? d[ctxtvar].replace(/<em>/g, "<em style="color:" +tooltipcolor + ";font-weight:bold;">") : ""
      ctxtvar = ctxtvar || "_ctxt.raw";
      if (_.isEmpty(_.filter(tailoredContexts, ["value", ctxtvar]))) {
        const newVar = _.filter(tailoredContexts, ["key", "model"])[0]["value"];
        ctxtvar = updateVar(dataset, "ctxt", newVar, level, type)["variable"];
      }
      const tooltipText1 = "<p><b>" + d["_id"] + "</b></p><p>";
      const tooltipText2 = d[ctxtvar].replace(/class=["']target["']/g, 'style="color:' + tooltipColor + ';font-weight:bold;"') + "</p>";
      // var tooltiptext = d[model + ".x"] + ", " + d[model + ".y"];

      d3.select("#concordance").append("p")
        .attr("class", "text-center p-2 ml-2")
        .style("border", "solid")
        .style("border-color", "gray")
        .style("font-size", "0.8em")
        .html(tooltipText1 + tooltipText2);

      d3.select(".dot")
        .append("path")
        .attr("class", "selector")
        .attr("transform", d3.select(this).attr("transform"))
        .attr("d", d3.symbol().type(d3.symbolCircle).size(250))
        .style("fill", "none")
        .style("stroke", compColor(d3.select(this).style("fill")))
        .style("stroke-width", 2);
    }

    // Set up the looks of the dots
    function styleDot(p) {
      d3.select(this).attr("d", d3.symbol()
        .type(function (d) { return (code(d, shapevar, shape, d3.symbolCircle)); })
        .size(function (d) { return (code(d, sizevar, size, 64)); })
      )
        .style("fill", function (d) { return code(d, colorvar, color, "#1f77b4"); })
        .style("opacity", tokenSelection.length > 0 ? 1 : 0.7)
        .classed("lighter", function (d) { return (tokenSelection.length > 0 ? (tokenSelection.indexOf(d["_id"]) === -1) : false); })
        // .classed("lost", function(d) {return (!exists(d, model)); })
        .on("mouseover", showContext)
        .on("mouseout", function () {
          d3.select("#concordance").select("p").remove();
          d3.selectAll(".selector").remove();
        })
        .on("click", function (d) {
          tokenSelection.indexOf(d["_id"]) === -1 ? tokenSelection.push(d["_id"]) : _.pull(tokenSelection, d["_id"]);
          updateTokSelection(tokenSelection);
        });

    }

    //FOR THE BRUSH
    function brushing() {
      const e = d3.event.selection;
      if (!(_.isNull(e))) {
        dot.classed("lighter", function (d) {
          var xc = newX(d[model + ".x"]);
          var yc = newY(d[model + ".y"]);
          // var xc = d3.select(this).attr("xcoord");
          // var yc = d3.select(this).attr("ycoord");
          return ((xc < e[0][0] + padding ||
            xc > e[1][0] + padding ||
            yc < e[0][1] + padding ||
            yc > e[1][1] + padding) &&
            exists(d, model));
        });
      }
    }

    function brushed(p) {
      _.pullAll(tokenSelection);
      dot.each(function (d) {
        if (!(d3.select(this).classed("lighter")) && exists(d, model)) {
          tokenSelection.push(d["_id"]);
        }
      });
      updateTokSelection(tokenSelection);
    }

    // Updating color, shape and size after every button clicking
    function updatePlot() {
      dot.style("fill", function (d) { return (code(d, colorvar, color, "#1f77b4")); })
        .attr("d", d3.symbol()
          .type(function (d) { return (code(d, shapevar, shape, d3.symbolCircle)); })
          .size(function (d) { return (code(d, sizevar, size, 64)); }));
    }


  }
}


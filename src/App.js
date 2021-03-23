import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { nanoid } from 'nanoid';
import Todo from './components/Todo';
import Form from './components/Form';
import List from '@material-ui/core/List';
import { Grid } from '@material-ui/core';

function App() {
  const [lists, setLists] = useState([]);

  const fetchListData = async () => {
    let response = await axios.post(
      `http://localhost:8080/fdb/todo/lists/query`,
      {
        select: [
          '*',
          {
            tasks: [
              '*',
              {
                assignedTo: ['*'],
              },
            ],
          },
        ],
        from: 'list',
        opts: {
          compact: true,
          orderBy: ['ASC', '_id'],
        },
      }
    );
    setLists(response.data);
  };

  useEffect(() => {
    fetchListData();
  }, []);

  function addList({ name, description, tasks }) {
    const newList = {
      _id: 'list$1',
      name,
      description,
      tasks: []
    }
    
    tasks.forEach((task, index) => {
      const newTask = {
        _id: `task$${index}`,
        name: task.task,
        isCompleted: task.completed,
        assignedTo: {
          _id: `assignee$${index}`,
          name: task.assignedTo,
          email: task.email
        }
      }
      
      //previously you were adding a new task or a new assignee as *both*
      // (A) nested transactions within the list$1 txn item, and
      // (B) independent txn items alongside the list$1 txn item
      
      //This refactor exclusively adds them as nested txn items *within* the list$1 txn item
      newList.tasks.push(newTask);
    });
    
    let transactLoad = [newList];

    // setLists((lists) => [...lists, newList]); -- I think we should call this after a successful update. There are ways (and good reasons) to do this state update the way you're doing it before the HTTP transaction, but it causes some complications in the event that the transaction fails
    
    const sendListData = async () => {
      let transactResponse = await axios.post(
        `http://localhost:8080/fdb/todo/lists/transact`,
        transactLoad
      );
      // setLists(transactResponse.data);
      // ^ I think this assumed that the response data would be the same as a query, but a transaction returns very different response data (i.e. the flakes and the tempids that were the result of the insertion/update)
      console.log(transactResponse.data);

      if (transactResponse.status === 200) {
        const _id = transactResponse?.data?.tempids['list$1']
        
        //I've moved setLists() down here
        setLists(prevLists => [...prevLists, { ...newList, _id }])
      }
    };
    sendListData();
  }

  const handleSubmit = (list) => {
    addList(list);
    console.log(list);
  };

  //tasks are deleted
  function deleteTask(chosenTask) {
    /*
    The two main things you'll want to do here are (a) delete the task from Fluree and (b) update your app state so that the deleted task is removed
    The first is pretty straightforward, as the txn would look something like
    [{
      _id: chosenTask._id,
      _action: "delete"
    }]
    The second will effectively involve....
    - creating a filtered version of lists such that the list with the deleted task has been updated and all the other lists remain the same
    - calling setLists with this updated set of lists
    */
    const remainingTasks = lists.map((list) => {
      const index = list.tasks.findIndex((task) => task.id === chosenTask.id);
      if (index) {
        delete list.tasks[index];
      }
      return list;
    });

    setLists(remainingTasks);
  }

  //tasks are edited
  async function editTask(newTask) {
    console.log(newTask);
    const editedTaskList = await lists.map((list) => {
      const index = list.tasks.findIndex((task) => task.id === newTask.id);
      if (index) {
        list.tasks[index] = newTask;
      }
      return list;
    });
    setLists(editedTaskList);
  }

  const TaskList = (props) => {
    const listItem = (
      <Todo
        name={props.list.name}
        description={props.list.description}
        id={props.list._id}
        tasks={props.list.tasks}
        key={props.list._id}
        deleteTask={deleteTask}
        editTask={editTask}
      />
    );

    return <div>{listItem}</div>;
  };
  console.log(lists);
  return (
    <Grid container alignItems='center' justify='center'>
      <Grid item xs={8}>
        <h1>TodoLists</h1>
        <Form submit={handleSubmit} />
      </Grid>
      <Grid item xs={8}>
        <List role='list' className='' aria-labelledby='list-heading'>
          {lists.map((list, i) => (
            <TaskList list={list} key={i} />
          ))}
        </List>
      </Grid>
    </Grid>
  );
}

export default App;
